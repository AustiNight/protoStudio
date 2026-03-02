import { useEffect, useMemo, useState } from 'react';

import pricingConfigRaw from '@/config/model-pricing.json';
import {
  useSettingsStore,
  type ModelSelection,
  type SettingsDeployHost as DeployHost,
  type SettingsPayload,
} from '@/store/settings-store';
import { useTelemetryStore } from '@/store/telemetry-store';
import type { PricingConfig } from '@/types/pricing';

type ProviderName = ModelSelection['provider'];

type TabKey = 'keys' | 'models' | 'deploy' | 'telemetry';

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

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
};

const MIN_PASSPHRASE_LENGTH = 12;
const VALIDATION_DELAY_MS = 800;

const pricingConfig = pricingConfigRaw as PricingConfig;

const MODEL_OPTIONS = buildModelOptions(pricingConfig.models);

const DEFAULT_SETTINGS: SettingsPayload = {
  version: 1,
  llmKeys: { openai: '', anthropic: '', google: '' },
  llmModels: {
    chat: { provider: 'openai', model: defaultModelFor('openai') },
    builder: { provider: 'openai', model: defaultModelFor('openai') },
  },
  deployTokens: { github: '', cloudflare: '', netlify: '', vercel: '' },
  updatedAt: 0,
};

const TABS: Array<{ id: TabKey; label: string; description: string }> = [
  {
    id: 'keys',
    label: 'LLM Keys',
    description: 'Store provider keys for chat and builder models.',
  },
  {
    id: 'models',
    label: 'Models',
    description: 'Pick the active models for chat and builder roles.',
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

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('keys');
  const [passphrase, setPassphrase] = useState('');
  const [settings, setSettings] = useState<SettingsPayload>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [keyStatus, setKeyStatus] = useState<Record<ProviderName, ValidationState>>(
    () => buildValidationMap(LLM_PROVIDERS),
  );
  const [tokenStatus, setTokenStatus] = useState<Record<DeployHost, ValidationState>>(
    () => buildValidationMap(DEPLOY_HOSTS),
  );
  const [isExportingTelemetry, setIsExportingTelemetry] = useState(false);

  const telemetrySessionId = useTelemetryStore((state) => state.sessionId);
  const telemetryCounters = useTelemetryStore((state) => state.counters);
  const telemetryEvents = useTelemetryStore((state) => state.events);
  const exportTelemetryBundle = useTelemetryStore((state) => state.exportBundle);
  const hasStoredSecrets = useSettingsStore((state) => state.hasStoredSecrets);
  const hydrateFromStorage = useSettingsStore((state) => state.hydrateFromStorage);
  const saveSettingsToStore = useSettingsStore((state) => state.saveSettings);
  const unlockSettingsInStore = useSettingsStore((state) => state.unlockSettings);
  const clearSettingsInStore = useSettingsStore((state) => state.clearSettings);

  const modelOptions = useMemo(() => MODEL_OPTIONS, []);
  const isPassphraseValid = passphrase.length >= MIN_PASSPHRASE_LENGTH;
  const storedUpdatedAt = useSettingsStore((state) => state.settings.updatedAt);
  const lastTelemetryTimestamp =
    telemetryEvents.length > 0
      ? telemetryEvents[telemetryEvents.length - 1]?.timestamp ?? null
      : null;

  useEffect(() => {
    if (!open) return;
    hydrateFromStorage();
    setSettings(normalizeSettings(useSettingsStore.getState().settings, modelOptions));
    setIsUnlocked(false);
    setNotice(null);
  }, [open, hydrateFromStorage, modelOptions]);

  useEffect(() => {
    if (open) return;
    setPassphrase('');
    setNotice(null);
  }, [open]);

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

  const handleUnlock = async () => {
    if (!isPassphraseValid) {
      setNotice({
        tone: 'error',
        message: `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
      });
      return;
    }
    if (!hasStoredSecrets) {
      setNotice({ tone: 'info', message: 'No saved settings found.' });
      return;
    }

    setIsWorking(true);
    const unlocked = await unlockSettingsInStore(passphrase);
    const storeState = useSettingsStore.getState();
    if (unlocked) {
      setSettings(normalizeSettings(storeState.settings, modelOptions));
      setKeyStatus(buildValidationMap(LLM_PROVIDERS));
      setTokenStatus(buildValidationMap(DEPLOY_HOSTS));
      setIsUnlocked(true);
      setNotice({ tone: 'success', message: 'Settings unlocked.' });
    } else {
      setNotice({
        tone: 'error',
        message: storeState.lastError ?? 'Unable to unlock settings.',
      });
    }
    setIsWorking(false);
  };

  const handleSave = async () => {
    if (!isPassphraseValid) {
      setNotice({
        tone: 'error',
        message: `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
      });
      return;
    }

    setIsWorking(true);
    const saved = await saveSettingsToStore(settings, passphrase);
    const storeState = useSettingsStore.getState();
    if (saved) {
      setSettings(normalizeSettings(storeState.settings, modelOptions));
      setIsUnlocked(true);
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
    setIsUnlocked(false);
    setSettings(normalizeSettings(useSettingsStore.getState().settings, modelOptions));
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
    setSettings((prev) => ({
      ...prev,
      llmKeys: { ...prev.llmKeys, [provider]: value },
    }));
    setKeyStatus((prev) => ({
      ...prev,
      [provider]: { status: 'idle', message: 'Not checked yet.' },
    }));
  };

  const handleDeployTokenChange = (host: DeployHost, value: string) => {
    setSettings((prev) => ({
      ...prev,
      deployTokens: { ...prev.deployTokens, [host]: value },
    }));
    setTokenStatus((prev) => ({
      ...prev,
      [host]: { status: 'idle', message: 'Not checked yet.' },
    }));
  };

  const handleModelProviderChange = (role: 'chat' | 'builder', provider: ProviderName) => {
    setSettings((prev) => {
      const normalized = normalizeModelSelection(
        { provider, model: prev.llmModels[role].model },
        modelOptions,
      );
      return {
        ...prev,
        llmModels: { ...prev.llmModels, [role]: normalized },
      };
    });
  };

  const handleModelChange = (role: 'chat' | 'builder', model: string) => {
    setSettings((prev) => ({
      ...prev,
      llmModels: {
        ...prev.llmModels,
        [role]: { ...prev.llmModels[role], model },
      },
    }));
  };

  const runKeyValidation = async (provider: ProviderName) => {
    const value = settings.llmKeys[provider].trim();
    setKeyStatus((prev) => ({
      ...prev,
      [provider]: { status: 'validating', message: 'Pinging...' },
    }));
    await delay(VALIDATION_DELAY_MS);
    const result = validateLlmKey(provider, value);
    const timeLabel = formatShortTime(Date.now());
    setKeyStatus((prev) => ({
      ...prev,
      [provider]: {
        status: result.ok ? 'valid' : 'invalid',
        message: `${result.message} (pinged ${timeLabel})`,
        checkedAt: Date.now(),
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
      className={`fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <div
        className={`relative mx-auto mt-16 w-[min(96vw,1100px)] rounded-3xl border border-slate-800/80 bg-slate-950/95 shadow-[0_24px_80px_rgba(15,23,42,0.6)] transition duration-200 ${
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
              Keys and tokens stay encrypted in your browser. No server sync.
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

        <div className="space-y-6 px-6 py-5">
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Encryption Passphrase</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Passphrase never leaves your browser. Minimum {MIN_PASSPHRASE_LENGTH} characters.
                </p>
              </div>
              {hasStoredSecrets && !isUnlocked && (
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-200">
                  Stored settings locked
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <input
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="Enter passphrase to unlock or save"
                className="w-full rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleUnlock}
                  disabled={!hasStoredSecrets || !isPassphraseValid || isWorking}
                  className="rounded-full border border-slate-800/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-emerald-300/60 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Unlock
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isPassphraseValid || isWorking}
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
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                {storedUpdatedAt
                  ? `Last saved ${formatLongDate(storedUpdatedAt)}`
                  : 'No encrypted settings saved yet.'}
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
              <SecretField
                label="OpenAI"
                description="Chat + builder calls routed to OpenAI."
                value={settings.llmKeys.openai}
                placeholder="sk-..."
                status={keyStatus.openai}
                onChange={(value) => handleLlmKeyChange('openai', value)}
                onValidate={() => runKeyValidation('openai')}
              />
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
              <GuideCard
                title="OpenAI key guide"
                steps={[
                  'Open the OpenAI dashboard and select API keys.',
                  'Create a new key with least privilege.',
                  'Paste it into the OpenAI field and click Ping.',
                ]}
              />
              <GuideCard
                title="Anthropic key guide"
                steps={[
                  'Open the Anthropic console and create a new API key.',
                  'Copy the key and keep it somewhere safe.',
                  'Paste it into the Anthropic field and click Ping.',
                ]}
              />
              <GuideCard
                title="Google key guide"
                steps={[
                  'Open Google AI Studio and generate an API key.',
                  'Restrict the key to allowed origins if possible.',
                  'Paste it into the Google field and click Ping.',
                ]}
              />
            </div>
          </section>

          <section role="tabpanel" hidden={activeTab !== 'models'}>
            <p className="text-sm text-slate-300">{TABS[1].description}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ModelCard
                title="Chat model"
                selection={settings.llmModels.chat}
                onProviderChange={(provider) => handleModelProviderChange('chat', provider)}
                onModelChange={(model) => handleModelChange('chat', model)}
                modelOptions={modelOptions}
              />
              <ModelCard
                title="Builder model"
                selection={settings.llmModels.builder}
                onProviderChange={(provider) => handleModelProviderChange('builder', provider)}
                onModelChange={(model) => handleModelChange('builder', model)}
                modelOptions={modelOptions}
              />
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 text-xs text-slate-400">
              Models listed here come from the pricing config (last updated {pricingConfig.lastUpdated}).
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
              <GuideCard
                title="GitHub Pages token guide"
                steps={[
                  'Create a classic or fine-grained token with repo permissions.',
                  'Enable workflow and Pages permissions for the repo.',
                  'Paste the token into the GitHub field and ping it.',
                ]}
              />
              <GuideCard
                title="Cloudflare Pages token guide"
                steps={[
                  'Create an API token with Pages and account access.',
                  'Copy the token and store it securely.',
                  'Paste it into the Cloudflare field and ping it.',
                ]}
              />
              <GuideCard
                title="Netlify token guide"
                steps={[
                  'Generate a personal access token in the Netlify UI.',
                  'Grant it access to deploy and manage sites.',
                  'Paste it into the Netlify field and ping it.',
                ]}
              />
              <GuideCard
                title="Vercel token guide"
                steps={[
                  'Create a token in your Vercel account settings.',
                  'Scope it to the projects you plan to use.',
                  'Paste it into the Vercel field and ping it.',
                ]}
              />
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

type ModelCardProps = {
  title: string;
  selection: ModelSelection;
  onProviderChange: (provider: ProviderName) => void;
  onModelChange: (model: string) => void;
  modelOptions: Record<ProviderName, string[]>;
};

function ModelCard({
  title,
  selection,
  onProviderChange,
  onModelChange,
  modelOptions,
}: ModelCardProps) {
  const modelsForProvider = modelOptions[selection.provider];

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
              {model}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type GuideCardProps = {
  title: string;
  steps: string[];
};

function GuideCard({ title, steps }: GuideCardProps) {
  return (
    <details className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-100">
        {title}
      </summary>
      <div className="mt-2 space-y-2 text-xs text-slate-400">
        {steps.map((step) => (
          <p key={step}>{step}</p>
        ))}
      </div>
    </details>
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
          : 'Idle';
  const tone =
    status === 'valid'
      ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
      : status === 'invalid'
        ? 'border-rose-300/40 bg-rose-300/10 text-rose-200'
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

function buildModelOptions(
  models: PricingConfig['models'],
): Record<ProviderName, string[]> {
  const options: Record<ProviderName, string[]> = {
    openai: [],
    anthropic: [],
    google: [],
  };

  for (const model of Object.keys(models)) {
    if (model.startsWith('gpt-')) {
      options.openai.push(model);
    } else if (model.startsWith('claude-')) {
      options.anthropic.push(model);
    } else if (model.startsWith('gemini-')) {
      options.google.push(model);
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
    },
    updatedAt: payload.updatedAt ?? DEFAULT_SETTINGS.updatedAt,
  };

  return {
    ...merged,
    llmModels: {
      chat: normalizeModelSelection(merged.llmModels.chat, modelOptions),
      builder: normalizeModelSelection(merged.llmModels.builder, modelOptions),
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

function buildValidationMap<T extends string>(keys: T[]): Record<T, ValidationState> {
  return keys.reduce((accumulator, key) => {
    accumulator[key] = { status: 'idle', message: 'Not checked yet.' };
    return accumulator;
  }, {} as Record<T, ValidationState>);
}

function validateLlmKey(
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
      message: valid ? 'OpenAI key looks valid.' : 'OpenAI key format looks off.',
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
