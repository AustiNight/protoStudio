import { useEffect, useMemo, useState } from 'react';

import { ExpandableGuide } from '@/components/settings/ExpandableGuide';
import {
  getOpenAIReasoningSettingOptionsForModel,
  normalizeOpenAIReasoningSettingForModel,
  supportsOpenAIReasoningForModel,
} from '@/config/openai-reasoning';
import pricingConfigRaw from '@/config/model-pricing.json';
import { isOpenAIModelId } from '@/config/model-pricing-schema';
import { runtimeConfig } from '@/config/runtime-config';
import { DEPLOY_TOKEN_GUIDES, LLM_KEY_GUIDES } from '@/config/token-guides';
import { resolvePricingModelId } from '@/engine/llm/cost';
import { createOpenAIKeyValidationRunner } from '@/engine/llm/openai-key-validation';
import {
  useSettingsStore,
  type ModelSelection,
  type OpenAIThinkingSettings,
  type SettingsDeployHost as DeployHost,
  type SettingsPayload,
} from '@/store/settings-store';
import { useTelemetryStore } from '@/store/telemetry-store';
import type { OpenAIReasoningSetting } from '@/types/llm';
import type { PricingConfig } from '@/types/pricing';

type ProviderName = ModelSelection['provider'];

type TabKey = 'keys' | 'models' | 'deploy' | 'telemetry';

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid' | 'error';

type ValidationState = {
  status: ValidationStatus;
  message: string;
  checkedAt?: number;
};

type NoticeTone = 'info' | 'success' | 'error';

type Notice = {
  tone: NoticeTone;
  message: string;
};

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  pricingGaps?: {
    missingByProvider: Record<ProviderName, string[]>;
    checkedAt: number;
    sources: string[];
  } | null;
};

const VALIDATION_DELAY_MS = 800;
const OPENAI_KEY_VALIDATION_TIMEOUT_MS = 10_000;
const OPENAI_SERVER_MANAGED = runtimeConfig.openAIRequestMode === 'proxy';

const pricingConfig = pricingConfigRaw as PricingConfig;

const NON_SELECTABLE_OPENAI_MODEL_PATTERNS: RegExp[] = [
  /^chatgpt-/i,
  /-codex$/i,
  /-preview$/i,
  /-search-preview$/i,
];

// Keep this list in sync with OpenAI docs when pricing config trails newest releases.
const MANUALLY_INCLUDED_OPENAI_MODEL_IDS = ['gpt-5-chat-latest', 'gpt-5.3-chat-latest'];

function isSelectableOpenAIModelId(modelId: string): boolean {
  if (!isOpenAIModelId(modelId)) {
    return false;
  }

  return NON_SELECTABLE_OPENAI_MODEL_PATTERNS.every((pattern) => !pattern.test(modelId));
}

const MODEL_OPTIONS = buildModelOptions(pricingConfig.models);

const OPENAI_THINKING_LABELS: Record<OpenAIReasoningSetting, string> = {
  default: 'Model default',
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
};

const DEFAULT_SETTINGS: SettingsPayload = {
  version: 1,
  llmKeys: { openai: '', anthropic: '', google: '' },
  llmModels: {
    chat: { provider: 'openai', model: defaultModelFor('openai') },
    builder: { provider: 'openai', model: defaultModelFor('openai') },
    critic: { provider: 'openai', model: defaultModelFor('openai') },
  },
  openaiThinking: {
    chat: runtimeConfig.settingsDefaults.openAIReasoning.chat,
    builder: runtimeConfig.settingsDefaults.openAIReasoning.builder,
    critic: runtimeConfig.settingsDefaults.openAIReasoning.critic,
  },
  deployTokens: { github: '', cloudflare: '', netlify: '', vercel: '' },
  updatedAt: 0,
};

const TABS: Array<{ id: TabKey; label: string; description: string }> = [
  {
    id: 'keys',
    label: 'LLM Keys',
    description: OPENAI_SERVER_MANAGED
      ? 'OpenAI key is server-managed. Configure Anthropic/Google keys locally.'
      : 'Store provider keys for chat and builder models.',
  },
  {
    id: 'models',
    label: 'Models',
    description: 'Pick the active models for chat, builder, and Web Designer roles.',
  },
  {
    id: 'deploy',
    label: 'Deploy Tokens',
    description: 'Connect zero-cost hosts for deploys.',
  },
  {
    id: 'telemetry',
    label: 'Telemetry',
    description: 'Export local-only telemetry captured for this session.',
  },
];

const LLM_PROVIDERS: ProviderName[] = ['openai', 'anthropic', 'google'];
const DEPLOY_HOSTS: DeployHost[] = ['github', 'cloudflare', 'netlify', 'vercel'];
const DEPLOY_HOST_OPTIONS: Array<{
  id: DeployHost;
  label: string;
  hint: string;
}> = [
  {
    id: 'github',
    label: 'GitHub Pages',
    hint: 'Requires repo + Pages permissions.',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Pages',
    hint: 'Requires Pages + account access.',
  },
  {
    id: 'netlify',
    label: 'Netlify',
    hint: 'Requires deploy + site management access.',
  },
  {
    id: 'vercel',
    label: 'Vercel',
    hint: 'Optional fallback; token must include project access.',
  },
];

export function SettingsModal({ open, onClose, pricingGaps = null }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('keys');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [keyStatus, setKeyStatus] = useState<Record<ProviderName, ValidationState>>(
    () => buildValidationMap(LLM_PROVIDERS),
  );
  const [tokenStatus, setTokenStatus] = useState<Record<DeployHost, ValidationState>>(
    () => buildValidationMap(DEPLOY_HOSTS),
  );
  const [isExportingTelemetry, setIsExportingTelemetry] = useState(false);
  const [isCopyingPricingChecklist, setIsCopyingPricingChecklist] = useState(false);

  const telemetrySessionId = useTelemetryStore((state) => state.sessionId);
  const telemetryCounters = useTelemetryStore((state) => state.counters);
  const telemetryEvents = useTelemetryStore((state) => state.events);
  const exportTelemetryBundle = useTelemetryStore((state) => state.exportBundle);
  const storeSettings = useSettingsStore((state) => state.settings);
  const hydrateFromStorage = useSettingsStore((state) => state.hydrateFromStorage);
  const setRuntimeSettings = useSettingsStore((state) => state.setRuntimeSettings);
  const updateRuntimeSettings = useSettingsStore((state) => state.updateRuntimeSettings);
  const saveSettingsToStore = useSettingsStore((state) => state.saveSettings);
  const clearSettingsInStore = useSettingsStore((state) => state.clearSettings);

  const modelOptions = useMemo(() => MODEL_OPTIONS, []);
  const openAIKeyValidationRunner = useMemo(
    () =>
      createOpenAIKeyValidationRunner({
        timeoutMs: OPENAI_KEY_VALIDATION_TIMEOUT_MS,
        requestMode: runtimeConfig.openAIRequestMode,
        proxyBaseUrl: runtimeConfig.openAIProxyBaseUrl,
      }),
    [],
  );
  const settings = useMemo(
    () => normalizeSettings(storeSettings, modelOptions),
    [modelOptions, storeSettings],
  );
  const storedUpdatedAt = settings.updatedAt;
  const lastTelemetryTimestamp =
    telemetryEvents.length > 0
      ? telemetryEvents[telemetryEvents.length - 1]?.timestamp ?? null
      : null;

  useEffect(() => {
    if (!open) return;
    hydrateFromStorage();
    setRuntimeSettings(normalizeSettings(useSettingsStore.getState().settings, modelOptions));
    setKeyStatus(buildValidationMap(LLM_PROVIDERS));
    setTokenStatus(buildValidationMap(DEPLOY_HOSTS));
    setNotice(null);
  }, [open, hydrateFromStorage, modelOptions, setRuntimeSettings]);

  useEffect(() => {
    if (open) return;
    setNotice(null);
  }, [open]);

  useEffect(() => {
    if (open) return;
    openAIKeyValidationRunner.cancel();
  }, [open, openAIKeyValidationRunner]);

  useEffect(() => () => openAIKeyValidationRunner.dispose(), [openAIKeyValidationRunner]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleSave = async () => {
    setIsWorking(true);
    const saved = await saveSettingsToStore(settings);
    const storeState = useSettingsStore.getState();
    if (saved) {
      setRuntimeSettings(normalizeSettings(storeState.settings, modelOptions));
      setNotice({ tone: 'success', message: 'Settings saved locally.' });
    } else {
      setNotice({
        tone: 'error',
        message: storeState.lastError ?? 'Unable to save settings.',
      });
    }
    setIsWorking(false);
  };

  const handleClearStored = () => {
    clearSettingsInStore();
    setRuntimeSettings(normalizeSettings(useSettingsStore.getState().settings, modelOptions));
    setKeyStatus(buildValidationMap(LLM_PROVIDERS));
    setTokenStatus(buildValidationMap(DEPLOY_HOSTS));
    setNotice({ tone: 'info', message: 'Stored settings cleared.' });
  };

  const handleTelemetryExport = async () => {
    if (isExportingTelemetry) {
      return;
    }
    setIsExportingTelemetry(true);
    try {
      const bundle = await exportTelemetryBundle();
      if (!bundle) {
        setNotice({ tone: 'error', message: 'No telemetry available to export.' });
        return;
      }
      if (typeof window === 'undefined') {
        setNotice({ tone: 'error', message: 'Telemetry export is unavailable.' });
        return;
      }
      const blob = new Blob([bundle], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `telemetry-${telemetrySessionId ?? 'session'}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setNotice({ tone: 'success', message: 'Telemetry exported.' });
    } finally {
      setIsExportingTelemetry(false);
    }
  };

  const handleLlmKeyChange = (provider: ProviderName, value: string) => {
    if (provider === 'openai') {
      openAIKeyValidationRunner.cancel();
    }
    updateRuntimeSettings((current) => ({
      ...current,
      llmKeys: { ...current.llmKeys, [provider]: value },
    }));
    setKeyStatus((prev) => ({
      ...prev,
      [provider]: { status: 'idle', message: 'Not checked yet.' },
    }));
  };

  const handleDeployTokenChange = (host: DeployHost, value: string) => {
    updateRuntimeSettings((current) => ({
      ...current,
      deployTokens: { ...current.deployTokens, [host]: value },
    }));
    setTokenStatus((prev) => ({
      ...prev,
      [host]: { status: 'idle', message: 'Not checked yet.' },
    }));
  };

  const handleModelProviderChange = (
    role: 'chat' | 'builder' | 'critic',
    provider: ProviderName,
  ) => {
    updateRuntimeSettings((current) => {
      const normalized = normalizeModelSelection(
        { provider, model: current.llmModels[role].model },
        modelOptions,
      );
      const nextThinking =
        normalized.provider === 'openai' &&
        supportsOpenAIReasoningForModel(normalized.model)
          ? normalizeOpenAIReasoningSettingForModel(
              normalized.model,
              current.openaiThinking[role],
            )
          : current.openaiThinking[role];
      return {
        ...current,
        llmModels: { ...current.llmModels, [role]: normalized },
        openaiThinking: {
          ...current.openaiThinking,
          [role]: nextThinking,
        },
      };
    });
  };

  const handleModelChange = (
    role: 'chat' | 'builder' | 'critic',
    model: string,
  ) => {
    updateRuntimeSettings((current) => ({
      ...current,
      llmModels: {
        ...current.llmModels,
        [role]: { ...current.llmModels[role], model },
      },
      openaiThinking: {
        ...current.openaiThinking,
        [role]:
          current.llmModels[role].provider === 'openai' &&
          supportsOpenAIReasoningForModel(model)
            ? normalizeOpenAIReasoningSettingForModel(model, current.openaiThinking[role])
            : current.openaiThinking[role],
      },
    }));
  };

  const handleOpenAIThinkingChange = (
    role: 'chat' | 'builder' | 'critic',
    value: OpenAIReasoningSetting,
  ) => {
    updateRuntimeSettings((current) => ({
      ...current,
      openaiThinking: {
        ...current.openaiThinking,
        [role]: value,
      },
    }));
  };

  const runKeyValidation = async (provider: ProviderName) => {
    const value = useSettingsStore.getState().settings.llmKeys[provider].trim();
    if (!value && !(provider === 'openai' && OPENAI_SERVER_MANAGED)) {
      setKeyStatus((prev) => ({
        ...prev,
        [provider]: { status: 'invalid', message: 'Key is empty.' },
      }));
      return;
    }

    if (provider === 'openai') {
      const formatHint = OPENAI_SERVER_MANAGED ? null : getOpenAIFormatHint(value);
      setKeyStatus((prev) => ({
        ...prev,
        [provider]: {
          status: 'validating',
          message: OPENAI_SERVER_MANAGED
            ? 'Checking server-side OpenAI gateway...'
            : formatHint
              ? `${formatHint} Checking with OpenAI...`
              : 'Checking with OpenAI...',
        },
      }));

      const result = await openAIKeyValidationRunner.validate(value);
      if (result.status === 'aborted') {
        return;
      }

      const timeLabel = formatShortTime(result.checkedAt);
      const status: ValidationStatus =
        result.status === 'valid'
          ? 'valid'
          : result.status === 'invalid'
            ? 'invalid'
            : 'error';
      const advisorySuffix = formatHint && status !== 'valid' ? ` ${formatHint}` : '';

      setKeyStatus((prev) => ({
        ...prev,
        [provider]: {
          status,
          message: `${result.message}${advisorySuffix} (pinged ${timeLabel})`,
          checkedAt: result.checkedAt,
        },
      }));
      return;
    }

    setKeyStatus((prev) => ({
      ...prev,
      [provider]: { status: 'validating', message: 'Pinging...' },
    }));
    await delay(VALIDATION_DELAY_MS);
    const result = validateLlmKeyFormat(provider, value);
    const checkedAt = Date.now();
    const timeLabel = formatShortTime(checkedAt);
    setKeyStatus((prev) => ({
      ...prev,
      [provider]: {
        status: result.ok ? 'valid' : 'invalid',
        message: `${result.message} (pinged ${timeLabel})`,
        checkedAt,
      },
    }));
  };

  const runTokenValidation = async (host: DeployHost) => {
    const value = settings.deployTokens[host].trim();
    setTokenStatus((prev) => ({
      ...prev,
      [host]: { status: 'validating', message: 'Pinging...' },
    }));
    await delay(VALIDATION_DELAY_MS);
    const result = validateDeployToken(host, value);
    const timeLabel = formatShortTime(Date.now());
    setTokenStatus((prev) => ({
      ...prev,
      [host]: {
        status: result.ok ? 'valid' : 'invalid',
        message: `${result.message} (pinged ${timeLabel})`,
        checkedAt: Date.now(),
      },
    }));
  };

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <div
        className={`relative mx-auto my-8 flex max-h-[calc(100vh-4rem)] w-[min(96vw,1100px)] flex-col rounded-3xl border border-slate-800/80 bg-slate-950/95 shadow-[0_24px_80px_rgba(15,23,42,0.6)] transition duration-200 ${
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 px-6 py-5">
          <div>
            <p className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-400">
              Studio Controls
            </p>
            <h2 id="settings-title" className="text-2xl font-semibold text-slate-100">
              Settings
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Settings are stored locally in this browser. No server sync.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-800/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-emerald-300/60 hover:text-emerald-200"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Local Settings</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Password protection is disabled. Persist or clear local settings here.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isWorking}
                className="rounded-full bg-emerald-300/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleClearStored}
                className="rounded-full border border-slate-800/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 transition hover:border-rose-300/60 hover:text-rose-200"
              >
                Clear
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                {storedUpdatedAt
                  ? `Last saved ${formatLongDate(storedUpdatedAt)}`
                  : 'No local settings saved yet.'}
              </span>
              <span>Validation pings run locally in this prototype.</span>
            </div>
            {notice && (
              <div
                className={`mt-3 rounded-2xl border px-4 py-2 text-xs ${
                  notice.tone === 'success'
                    ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200'
                    : notice.tone === 'error'
                      ? 'border-rose-300/40 bg-rose-300/10 text-rose-200'
                      : 'border-slate-700/80 bg-slate-900/50 text-slate-300'
                }`}
              >
                {notice.message}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-2">
            <div role="tablist" aria-label="Settings tabs" className="flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                    activeTab === tab.id
                      ? 'bg-emerald-300/90 text-slate-950'
                      : 'text-slate-300 hover:text-emerald-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          <section role="tabpanel" hidden={activeTab !== 'keys'}>
            <p className="text-sm text-slate-300">{TABS[0].description}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {OPENAI_SERVER_MANAGED ? (
                <ServerManagedOpenAIField
                  status={keyStatus.openai}
                  onValidate={() => runKeyValidation('openai')}
                />
              ) : (
                <SecretField
                  label="OpenAI"
                  description="Chat + builder calls routed directly to OpenAI."
                  value={settings.llmKeys.openai}
                  placeholder="sk-..."
                  status={keyStatus.openai}
                  onChange={(value) => handleLlmKeyChange('openai', value)}
                  onValidate={() => runKeyValidation('openai')}
                />
              )}
              <SecretField
                label="Anthropic"
                description="Claude models for reasoning-heavy work."
                value={settings.llmKeys.anthropic}
                placeholder="sk-ant-..."
                status={keyStatus.anthropic}
                onChange={(value) => handleLlmKeyChange('anthropic', value)}
                onValidate={() => runKeyValidation('anthropic')}
              />
              <SecretField
                label="Google"
                description="Gemini models for multimodal jobs."
                value={settings.llmKeys.google}
                placeholder="AIza..."
                status={keyStatus.google}
                onChange={(value) => handleLlmKeyChange('google', value)}
                onValidate={() => runKeyValidation('google')}
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {LLM_KEY_GUIDES.map((guide) => (
                <ExpandableGuide
                  key={guide.id}
                  title={guide.title}
                  steps={guide.steps}
                  urls={guide.urls}
                  securityNotes={guide.securityNotes}
                  lastVerified={guide.lastVerified}
                />
              ))}
            </div>
          </section>

          <section role="tabpanel" hidden={activeTab !== 'models'}>
            <p className="text-sm text-slate-300">{TABS[1].description}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <ModelCard
                title="Chat model"
                selection={settings.llmModels.chat}
                onProviderChange={(provider) => handleModelProviderChange('chat', provider)}
                onModelChange={(model) => handleModelChange('chat', model)}
                thinkingLevel={settings.openaiThinking.chat}
                onThinkingChange={(value) => handleOpenAIThinkingChange('chat', value)}
                modelOptions={modelOptions}
              />
              <ModelCard
                title="Builder model"
                selection={settings.llmModels.builder}
                onProviderChange={(provider) => handleModelProviderChange('builder', provider)}
                onModelChange={(model) => handleModelChange('builder', model)}
                thinkingLevel={settings.openaiThinking.builder}
                onThinkingChange={(value) => handleOpenAIThinkingChange('builder', value)}
                modelOptions={modelOptions}
              />
              <ModelCard
                title="Web Designer model"
                selection={settings.llmModels.critic}
                onProviderChange={(provider) => handleModelProviderChange('critic', provider)}
                onModelChange={(model) => handleModelChange('critic', model)}
                thinkingLevel={settings.openaiThinking.critic}
                onThinkingChange={(value) => handleOpenAIThinkingChange('critic', value)}
                modelOptions={modelOptions}
              />
            </div>
            <PricingGapPanel
              pricingGaps={pricingGaps}
              isCopying={isCopyingPricingChecklist}
              onCopy={async () => {
                if (!pricingGaps) {
                  return;
                }
                setIsCopyingPricingChecklist(true);
                const copied = await copyTextToClipboard(
                  buildPricingGapChecklist(pricingGaps),
                );
                setIsCopyingPricingChecklist(false);
                setNotice({
                  tone: copied ? 'success' : 'error',
                  message: copied
                    ? 'Pricing gap checklist copied.'
                    : 'Unable to copy checklist. Clipboard permissions may be blocked.',
                });
              }}
            />
            <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 text-xs text-slate-400">
              Models listed here come from the pricing config (last updated {pricingConfig.lastUpdated}).
              Options labeled <span className="text-amber-200">est.</span> use fallback pricing.
            </div>
          </section>

          <section role="tabpanel" hidden={activeTab !== 'deploy'}>
            <p className="text-sm text-slate-300">{TABS[2].description}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <SecretField
                label="GitHub"
                description="Required for GitHub Pages deploys."
                value={settings.deployTokens.github}
                placeholder="ghp_... or github_pat_..."
                status={tokenStatus.github}
                actionLabel="Test token"
                onChange={(value) => handleDeployTokenChange('github', value)}
                onValidate={() => runTokenValidation('github')}
              />
              <SecretField
                label="Cloudflare"
                description="Required for Cloudflare Pages deploys."
                value={settings.deployTokens.cloudflare}
                placeholder="Cloudflare API token"
                status={tokenStatus.cloudflare}
                actionLabel="Test token"
                onChange={(value) => handleDeployTokenChange('cloudflare', value)}
                onValidate={() => runTokenValidation('cloudflare')}
              />
              <SecretField
                label="Netlify"
                description="Required for Netlify deploys."
                value={settings.deployTokens.netlify}
                placeholder="Netlify personal access token"
                status={tokenStatus.netlify}
                actionLabel="Test token"
                onChange={(value) => handleDeployTokenChange('netlify', value)}
                onValidate={() => runTokenValidation('netlify')}
              />
              <SecretField
                label="Vercel"
                description="Optional fallback deploy target."
                value={settings.deployTokens.vercel}
                placeholder="vercel_..."
                status={tokenStatus.vercel}
                actionLabel="Test token"
                onChange={(value) => handleDeployTokenChange('vercel', value)}
                onValidate={() => runTokenValidation('vercel')}
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {DEPLOY_HOST_OPTIONS.map((host) => {
                const validation = tokenStatus[host.id].status;
                const unlocked = validation === 'valid';
                const lockedMessage =
                  validation === 'invalid'
                    ? 'Locked: token failed validation.'
                    : validation === 'validating'
                      ? 'Checking token...'
                      : 'Locked: test the token to unlock.';
                return (
                  <div
                    key={host.id}
                    className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-100">
                          {host.label}
                        </h4>
                        <p className="mt-1 text-xs text-slate-400">{host.hint}</p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                          unlocked
                            ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
                            : 'border-slate-700/80 bg-slate-900/60 text-slate-400'
                        }`}
                      >
                        {unlocked ? 'Unlocked' : 'Locked'}
                      </span>
                    </div>
                    <p
                      className={`mt-2 text-xs ${
                        unlocked ? 'text-emerald-200' : 'text-slate-400'
                      }`}
                    >
                      {unlocked ? 'Ready to deploy.' : lockedMessage}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {DEPLOY_TOKEN_GUIDES.map((guide) => (
                <ExpandableGuide
                  key={guide.id}
                  title={guide.title}
                  steps={guide.steps}
                  urls={guide.urls}
                  securityNotes={guide.securityNotes}
                  lastVerified={guide.lastVerified}
                />
              ))}
            </div>
          </section>

          <section role="tabpanel" hidden={activeTab !== 'telemetry'}>
            <p className="text-sm text-slate-300">{TABS[3].description}</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  Session ID
                </div>
                <div className="mt-2 text-sm text-slate-100">
                  {telemetrySessionId ?? 'No active session'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  Events Logged
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">
                  {telemetryEvents.length}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  Last Event
                </div>
                <div className="mt-2 text-sm text-slate-100">
                  {lastTelemetryTimestamp
                    ? formatLongDate(lastTelemetryTimestamp)
                    : 'No activity yet'}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-3">
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  Messages
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  {telemetryCounters.messageCount}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-3">
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  Backlog
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  {telemetryCounters.backlogCount}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-3">
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  Builds
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  {telemetryCounters.buildCount}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-3">
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  Deploys
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  {telemetryCounters.deployCount}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleTelemetryExport}
                disabled={isExportingTelemetry || telemetryEvents.length === 0}
                className="rounded-full border border-slate-800/80 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-emerald-300/60 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExportingTelemetry ? 'Exporting' : 'Export JSON'}
              </button>
              <span className="text-xs text-slate-400">
                Stored locally in IndexedDB. No network calls.
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

type SecretFieldProps = {
  label: string;
  description: string;
  value: string;
  placeholder: string;
  status: ValidationState;
  actionLabel?: string;
  onChange: (value: string) => void;
  onValidate: () => void;
};

function SecretField({
  label,
  description,
  value,
  placeholder,
  status,
  actionLabel = 'Ping',
  onChange,
  onValidate,
}: SecretFieldProps) {
  const [reveal, setReveal] = useState(false);
  const statusTone =
    status.status === 'valid'
      ? 'text-emerald-200'
      : status.status === 'invalid'
        ? 'text-rose-200'
        : status.status === 'error'
          ? 'text-amber-200'
        : 'text-slate-400';

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">{label}</h4>
          <p className="mt-1 text-xs text-slate-400">{description}</p>
        </div>
        <StatusBadge status={status.status} />
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type={reveal ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full flex-1 rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReveal((prev) => !prev)}
            className="rounded-full border border-slate-800/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition hover:border-slate-600/80 hover:text-slate-100"
          >
            {reveal ? 'Hide' : 'Reveal'}
          </button>
          <button
            type="button"
            onClick={onValidate}
            className="rounded-full bg-emerald-300/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-200"
          >
            {actionLabel}
          </button>
        </div>
      </div>
      <p className={`mt-2 text-xs ${statusTone}`}>{status.message}</p>
    </div>
  );
}

function ServerManagedOpenAIField({
  status,
  onValidate,
}: {
  status: ValidationState;
  onValidate: () => void;
}) {
  const statusTone =
    status.status === 'valid'
      ? 'text-emerald-200'
      : status.status === 'invalid'
        ? 'text-rose-200'
        : status.status === 'error'
          ? 'text-amber-200'
          : 'text-slate-400';

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">OpenAI</h4>
          <p className="mt-1 text-xs text-slate-400">
            Server-managed through the `/api/openai` gateway. Rotate only the server
            `OPENAI_API_KEY` secret.
          </p>
        </div>
        <StatusBadge status={status.status} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onValidate}
          className="rounded-full bg-emerald-300/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-200"
        >
          Ping proxy
        </button>
      </div>
      <p className={`mt-2 text-xs ${statusTone}`}>{status.message}</p>
    </div>
  );
}

type ModelCardProps = {
  title: string;
  selection: ModelSelection;
  onProviderChange: (provider: ProviderName) => void;
  onModelChange: (model: string) => void;
  thinkingLevel: OpenAIReasoningSetting;
  onThinkingChange: (value: OpenAIReasoningSetting) => void;
  modelOptions: Record<ProviderName, string[]>;
};

function ModelCard({
  title,
  selection,
  onProviderChange,
  onModelChange,
  thinkingLevel,
  onThinkingChange,
  modelOptions,
}: ModelCardProps) {
  const modelsForProvider = modelOptions[selection.provider];
  const openAIThinkingOptions = buildOpenAIThinkingOptions(selection.model);
  const showOpenAIThinking =
    selection.provider === 'openai' && openAIThinkingOptions.length > 0;
  const normalizedThinkingLevel = normalizeOpenAIReasoningSettingForModel(
    selection.model,
    thinkingLevel,
  );

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
      <h4 className="text-sm font-semibold text-slate-100">{title}</h4>
      <div className="mt-3 grid gap-3">
        <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
          Provider
        </label>
        <select
          value={selection.provider}
          onChange={(event) => onProviderChange(event.target.value as ProviderName)}
          className="w-full rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
        >
          {LLM_PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
        <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
          Model
        </label>
        <select
          value={selection.model}
          onChange={(event) => onModelChange(event.target.value)}
          className="w-full rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
        >
          {modelsForProvider.map((model) => (
            <option key={model} value={model}>
              {formatModelOptionLabel(model)}
            </option>
          ))}
        </select>
        {selection.provider === 'openai' && (
          <ModelPricingStatusNotice modelId={selection.model} />
        )}
        {showOpenAIThinking && (
          <>
            <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Thinking
            </label>
            <select
              value={normalizedThinkingLevel}
              onChange={(event) =>
                onThinkingChange(event.target.value as OpenAIReasoningSetting)
              }
              className="w-full rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
            >
              {openAIThinkingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ValidationStatus }) {
  const label =
    status === 'validating'
      ? 'Pinging'
      : status === 'valid'
        ? 'Valid'
        : status === 'invalid'
          ? 'Invalid'
          : status === 'error'
            ? 'Error'
          : 'Idle';
  const tone =
    status === 'valid'
      ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
      : status === 'invalid'
        ? 'border-rose-300/40 bg-rose-300/10 text-rose-200'
        : status === 'error'
          ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
        : status === 'validating'
          ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
          : 'border-slate-700/80 bg-slate-900/60 text-slate-400';

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${tone}`}
    >
      {label}
    </span>
  );
}

export function buildModelOptions(
  models: PricingConfig['models'],
): Record<ProviderName, string[]> {
  const options: Record<ProviderName, string[]> = {
    openai: [],
    anthropic: [],
    google: [],
  };

  for (const model of Object.keys(models)) {
    if (isSelectableOpenAIModelId(model)) {
      options.openai.push(model);
    } else if (model.startsWith('claude-')) {
      options.anthropic.push(model);
    } else if (model.startsWith('gemini-')) {
      options.google.push(model);
    }
  }

  for (const model of MANUALLY_INCLUDED_OPENAI_MODEL_IDS) {
    if (isOpenAIModelId(model) && !options.openai.includes(model)) {
      options.openai.push(model);
    }
  }

  return options;
}

function defaultModelFor(provider: ProviderName): string {
  const models = MODEL_OPTIONS[provider];
  return models[0] ?? '';
}

function normalizeSettings(
  payload: Partial<SettingsPayload>,
  modelOptions: Record<ProviderName, string[]>,
): SettingsPayload {
  const merged: SettingsPayload = {
    ...DEFAULT_SETTINGS,
    ...payload,
    llmKeys: { ...DEFAULT_SETTINGS.llmKeys, ...payload.llmKeys },
    deployTokens: { ...DEFAULT_SETTINGS.deployTokens, ...payload.deployTokens },
    llmModels: {
      chat: { ...DEFAULT_SETTINGS.llmModels.chat, ...payload.llmModels?.chat },
      builder: { ...DEFAULT_SETTINGS.llmModels.builder, ...payload.llmModels?.builder },
      critic: { ...DEFAULT_SETTINGS.llmModels.critic, ...payload.llmModels?.critic },
    },
    openaiThinking: normalizeOpenAIThinkingSettings(payload.openaiThinking),
    updatedAt: payload.updatedAt ?? DEFAULT_SETTINGS.updatedAt,
  };

  const llmModels = {
    chat: normalizeModelSelection(merged.llmModels.chat, modelOptions),
    builder: normalizeModelSelection(merged.llmModels.builder, modelOptions),
    critic: normalizeModelSelection(merged.llmModels.critic, modelOptions),
  };

  return {
    ...merged,
    llmModels,
    openaiThinking: {
      chat:
        llmModels.chat.provider === 'openai' &&
        supportsOpenAIReasoningForModel(llmModels.chat.model)
          ? normalizeOpenAIReasoningSettingForModel(
              llmModels.chat.model,
              merged.openaiThinking.chat,
            )
          : merged.openaiThinking.chat,
      builder:
        llmModels.builder.provider === 'openai' &&
        supportsOpenAIReasoningForModel(llmModels.builder.model)
          ? normalizeOpenAIReasoningSettingForModel(
              llmModels.builder.model,
              merged.openaiThinking.builder,
            )
          : merged.openaiThinking.builder,
      critic:
        llmModels.critic.provider === 'openai' &&
        supportsOpenAIReasoningForModel(llmModels.critic.model)
          ? normalizeOpenAIReasoningSettingForModel(
              llmModels.critic.model,
              merged.openaiThinking.critic,
            )
          : merged.openaiThinking.critic,
    },
  };
}

function normalizeModelSelection(
  selection: ModelSelection,
  modelOptions: Record<ProviderName, string[]>,
): ModelSelection {
  const provider = isProvider(selection.provider) ? selection.provider : 'openai';
  const models = modelOptions[provider];
  const model = models.includes(selection.model) ? selection.model : models[0] ?? '';
  return { provider, model };
}

function normalizeOpenAIThinkingSettings(
  value: unknown,
): OpenAIThinkingSettings {
  const defaults = DEFAULT_SETTINGS.openaiThinking;
  if (!isRecord(value)) {
    return { ...defaults };
  }
  return {
    chat: isOpenAIReasoningSetting(value.chat) ? value.chat : defaults.chat,
    builder: isOpenAIReasoningSetting(value.builder) ? value.builder : defaults.builder,
    critic: isOpenAIReasoningSetting(value.critic) ? value.critic : defaults.critic,
  };
}

function buildOpenAIThinkingOptions(
  modelId: string,
): Array<{ value: OpenAIReasoningSetting; label: string }> {
  const options = getOpenAIReasoningSettingOptionsForModel(modelId);
  return options.map((value) => ({
    value,
    label: OPENAI_THINKING_LABELS[value],
  }));
}

type PricingStatusType = 'exact' | 'estimated' | 'unpriced';

type PricingStatus = {
  type: PricingStatusType;
  resolvedModelId: string | null;
};

function resolvePricingStatus(modelId: string): PricingStatus {
  const resolution = resolvePricingModelId(modelId);
  if (!resolution) {
    return {
      type: 'unpriced',
      resolvedModelId: null,
    };
  }

  return {
    type: resolution.estimated ? 'estimated' : 'exact',
    resolvedModelId: resolution.modelId,
  };
}

function formatModelOptionLabel(modelId: string): string {
  const status = resolvePricingStatus(modelId);
  if (status.type === 'unpriced') {
    return `${modelId} (unpriced)`;
  }
  if (
    status.type === 'estimated' &&
    status.resolvedModelId &&
    status.resolvedModelId !== modelId
  ) {
    return `${modelId} (est. via ${status.resolvedModelId})`;
  }
  if (status.type === 'estimated') {
    return `${modelId} (estimated)`;
  }
  return modelId;
}

function ModelPricingStatusNotice({ modelId }: { modelId: string }) {
  const status = resolvePricingStatus(modelId);

  if (status.type === 'exact') {
    return null;
  }

  if (status.type === 'unpriced') {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">
        Pricing is unavailable for this model. Cost totals will mark this usage as
        unknown.
      </div>
    );
  }

  const resolvedLabel =
    status.resolvedModelId && status.resolvedModelId !== modelId
      ? status.resolvedModelId
      : 'a related model';

  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">
      Cost totals for this model are estimated using rates for {resolvedLabel}.
    </div>
  );
}

function buildValidationMap<T extends string>(keys: T[]): Record<T, ValidationState> {
  return keys.reduce((accumulator, key) => {
    accumulator[key] = { status: 'idle', message: 'Not checked yet.' };
    return accumulator;
  }, {} as Record<T, ValidationState>);
}

function validateLlmKeyFormat(
  provider: ProviderName,
  value: string,
): { ok: boolean; message: string } {
  if (!value) {
    return { ok: false, message: 'Key is empty.' };
  }

  if (provider === 'openai') {
    const valid = /^sk-(?:proj-)?[A-Za-z0-9]{10,}/.test(value);
    return {
      ok: valid,
      message: valid
        ? 'Format hint: OpenAI key pattern looks reasonable.'
        : 'Format hint: OpenAI keys usually start with sk- and are longer.',
    };
  }
  if (provider === 'anthropic') {
    const valid = /^sk-ant-[A-Za-z0-9_-]{10,}/.test(value);
    return {
      ok: valid,
      message: valid ? 'Anthropic key looks valid.' : 'Anthropic key format looks off.',
    };
  }

  const valid = /^AIza[0-9A-Za-z-_]{20,}/.test(value);
  return {
    ok: valid,
    message: valid ? 'Google key looks valid.' : 'Google key format looks off.',
  };
}

function getOpenAIFormatHint(value: string): string | null {
  const format = validateLlmKeyFormat('openai', value);
  return format.ok ? null : format.message;
}

function validateDeployToken(
  host: DeployHost,
  value: string,
): { ok: boolean; message: string } {
  if (!value) {
    return { ok: false, message: 'Token is empty. Paste a token and click Test token.' };
  }

  if (host === 'github') {
    const valid =
      /^gh[pousr]_[A-Za-z0-9]{20,}/.test(value) ||
      /^github_pat_[A-Za-z0-9_]{20,}/.test(value);
    return {
      ok: valid,
      message: valid
        ? 'GitHub token looks valid.'
        : 'GitHub token format looks off. Use ghp_... or github_pat_... with repo scope.',
    };
  }
  if (host === 'cloudflare') {
    const valid = /^[A-Za-z0-9_-]{40,}/.test(value);
    return {
      ok: valid,
      message: valid
        ? 'Cloudflare token looks valid.'
        : 'Cloudflare token format looks off. Create a Pages API token with account access.',
    };
  }
  if (host === 'netlify') {
    const valid = /^[A-Za-z0-9_-]{30,}/.test(value);
    return {
      ok: valid,
      message: valid
        ? 'Netlify token looks valid.'
        : 'Netlify token format looks off. Generate a personal access token with deploy permissions.',
    };
  }

  const valid = /^(vercel|vrc)_[A-Za-z0-9_-]{10,}/.test(value);
  return {
    ok: valid,
    message: valid
      ? 'Vercel token looks valid.'
      : 'Vercel token format looks off. Create a token in Vercel settings and re-test.',
  };
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function isProvider(value: string): value is ProviderName {
  return value === 'openai' || value === 'anthropic' || value === 'google';
}

function isOpenAIReasoningSetting(value: unknown): value is OpenAIReasoningSetting {
  return (
    value === 'default' ||
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatLongDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatShortTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function PricingGapPanel({
  pricingGaps,
  isCopying,
  onCopy,
}: {
  pricingGaps: SettingsModalProps['pricingGaps'];
  isCopying: boolean;
  onCopy: () => void;
}) {
  const total =
    (pricingGaps?.missingByProvider.openai.length ?? 0) +
    (pricingGaps?.missingByProvider.anthropic.length ?? 0) +
    (pricingGaps?.missingByProvider.google.length ?? 0);

  return (
    <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 text-xs text-slate-300">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.25em] text-slate-400">
            Pricing Gaps
          </div>
          <div className="mt-1 text-sm text-slate-100">
            {total > 0 ? `${total} unpriced model IDs detected` : 'No pricing gaps detected'}
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!pricingGaps || total === 0 || isCopying}
          className="rounded-full border border-slate-700/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200 transition hover:border-emerald-300/70 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCopying ? 'Copying' : 'Copy PR Checklist'}
        </button>
      </div>
      {pricingGaps && (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] text-slate-400">
            Checked {formatLongDate(pricingGaps.checkedAt)} · Sources:{' '}
            {pricingGaps.sources.join(', ')}
          </div>
          <ProviderGapRow label="OpenAI" ids={pricingGaps.missingByProvider.openai} />
          <ProviderGapRow label="Anthropic" ids={pricingGaps.missingByProvider.anthropic} />
          <ProviderGapRow label="Google" ids={pricingGaps.missingByProvider.google} />
        </div>
      )}
    </div>
  );
}

function ProviderGapRow({ label, ids }: { label: string; ids: string[] }) {
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between">
        <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-400">
          {label}
        </span>
        <span className="text-[11px] text-slate-300">{ids.length}</span>
      </div>
      {ids.length === 0 ? (
        <div className="mt-1 text-[11px] text-slate-500">No gaps</div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <span
              key={`${label}-${id}`}
              className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100"
            >
              {id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function buildPricingGapChecklist(
  pricingGaps: NonNullable<SettingsModalProps['pricingGaps']>,
): string {
  const lines: string[] = [
    '# Pricing Metadata Update Checklist',
    '',
    `- Checked at: ${new Date(pricingGaps.checkedAt).toISOString()}`,
    `- Sources: ${pricingGaps.sources.join(', ')}`,
    '',
  ];
  (['openai', 'anthropic', 'google'] as const).forEach((provider) => {
    const ids = pricingGaps.missingByProvider[provider];
    lines.push(`## ${provider}`);
    if (ids.length === 0) {
      lines.push('- No missing models.');
    } else {
      ids.forEach((id) => {
        lines.push(
          `- [ ] Add \`${id}\` to \`src/config/model-pricing.json\` with promptPer1K, completionPer1K, sourceUrls, reviewedAt.`,
        );
      });
    }
    lines.push('');
  });
  return lines.join('\n').trim();
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
