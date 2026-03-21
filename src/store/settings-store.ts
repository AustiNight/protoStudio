import { create } from 'zustand';

import { runtimeConfig } from '../config/runtime-config';
import {
  clearEncryptedSettings,
  readEncryptedSettings,
  writeEncryptedSettings,
} from '../persistence/settings-storage';
import type { OpenAIReasoningSetting } from '../types/llm';
import type { ImageryPauseMode } from '../types/imagery-policy';
import type { LLMProviderName } from '../types/session';

export type SettingsDeployHost = 'github' | 'cloudflare' | 'netlify' | 'vercel';

export interface ModelSelection {
  provider: LLMProviderName;
  model: string;
}

export interface OpenAIThinkingSettings {
  chat: OpenAIReasoningSetting;
  builder: OpenAIReasoningSetting;
  critic: OpenAIReasoningSetting;
}

export interface SettingsPayload {
  version: 1;
  llmKeys: Record<LLMProviderName, string>;
  llmModels: {
    chat: ModelSelection;
    builder: ModelSelection;
    critic: ModelSelection;
    imaging: ModelSelection;
  };
  openaiThinking: OpenAIThinkingSettings;
  imageryPauseMode: ImageryPauseMode;
  deployTokens: Record<SettingsDeployHost, string>;
  updatedAt: number;
}

export interface SettingsStoreState {
  settings: SettingsPayload;
  lastError: string | null;
  hydrateFromStorage: () => void;
  setRuntimeSettings: (settings: SettingsPayload) => void;
  updateRuntimeSettings: (updater: (settings: SettingsPayload) => SettingsPayload) => void;
  saveSettings: (settings: SettingsPayload) => Promise<boolean>;
  clearSettings: () => void;
  resetStore: () => void;
}

export const createSettingsStore = () =>
  create<SettingsStoreState>((set) => ({
    ...buildInitialState(),
    hydrateFromStorage: () =>
      set(() => {
        const stored = readEncryptedSettings();
        if (!stored) {
          return {};
        }
        const parsed = parseSettingsPayload(stored);
        if (!parsed) {
          return {
            lastError: 'Stored settings payload is invalid.',
          };
        }
        return {
          settings: parsed,
          lastError: null,
        };
      }),
    setRuntimeSettings: (settings) =>
      set(() => ({
        settings: cloneSettings(settings),
        lastError: null,
      })),
    updateRuntimeSettings: (updater) =>
      set((state) => {
        const next = updater(cloneSettings(state.settings));
        return {
          settings: cloneSettings({
            ...next,
            updatedAt: state.settings.updatedAt,
          }),
          lastError: null,
        };
      }),
    saveSettings: async (settings) => {
      try {
        const updatedSettings = normalizeSettings(settings);
        writeEncryptedSettings(JSON.stringify(updatedSettings));
        set(() => ({
          settings: updatedSettings,
          lastError: null,
        }));
        return true;
      } catch (error) {
        set(() => ({
          lastError: getErrorMessage(error),
        }));
        return false;
      }
    },
    clearSettings: () => {
      clearEncryptedSettings();
      set(() => ({
        settings: buildDefaultSettings(),
        lastError: null,
      }));
    },
    resetStore: () =>
      set(() => ({
        ...buildInitialState(),
      })),
  }));

export const useSettingsStore = createSettingsStore();

export const selectSettings = (state: SettingsStoreState) => state.settings;
export const selectDeployToken = (host: SettingsDeployHost) =>
  (state: SettingsStoreState) => state.settings.deployTokens[host];
export const selectLlmKey = (provider: LLMProviderName) =>
  (state: SettingsStoreState) => state.settings.llmKeys[provider];

function buildDefaultSettings(): SettingsPayload {
  const defaults = runtimeConfig.settingsDefaults;
  return {
    version: 1,
    llmKeys: normalizeLlmKeys({
      openai: defaults.llmKeys.openai,
      anthropic: defaults.llmKeys.anthropic,
      google: defaults.llmKeys.google,
    }),
    llmModels: {
      chat: {
        provider: defaults.chatProvider,
        model: defaults.chatModel,
      },
      builder: {
        provider: defaults.builderProvider,
        model: defaults.builderModel,
      },
      critic: {
        provider: defaults.criticProvider,
        model: defaults.criticModel,
      },
      imaging: {
        provider: defaults.imagingProvider,
        model: defaults.imagingModel,
      },
    },
    openaiThinking: {
      chat: defaults.openAIReasoning.chat,
      builder: defaults.openAIReasoning.builder,
      critic: defaults.openAIReasoning.critic,
    },
    imageryPauseMode: 'balanced',
    deployTokens: {
      github: defaults.deployTokens.github,
      cloudflare: defaults.deployTokens.cloudflare,
      netlify: defaults.deployTokens.netlify,
      vercel: defaults.deployTokens.vercel,
    },
    updatedAt: 0,
  };
}

function buildInitialState(): Pick<
  SettingsStoreState,
  'settings' | 'lastError'
> {
  const stored = readEncryptedSettings();
  const parsed = stored ? parseSettingsPayload(stored) : null;
  return {
    settings: parsed ?? buildDefaultSettings(),
    lastError: null,
  };
}

function normalizeSettings(settings: SettingsPayload): SettingsPayload {
  const now = Date.now();
  return {
    version: 1,
    llmKeys: normalizeLlmKeys(settings.llmKeys),
    llmModels: {
      chat: { ...settings.llmModels.chat },
      builder: { ...settings.llmModels.builder },
      critic: { ...settings.llmModels.critic },
      imaging: { ...settings.llmModels.imaging },
    },
    openaiThinking: normalizeOpenAIThinking(settings.openaiThinking),
    imageryPauseMode: normalizeImageryPauseMode(settings.imageryPauseMode),
    deployTokens: { ...settings.deployTokens },
    updatedAt: now,
  };
}

function cloneSettings(settings: SettingsPayload): SettingsPayload {
  return {
    version: 1,
    llmKeys: normalizeLlmKeys(settings.llmKeys),
    llmModels: {
      chat: { ...settings.llmModels.chat },
      builder: { ...settings.llmModels.builder },
      critic: { ...settings.llmModels.critic },
      imaging: { ...settings.llmModels.imaging },
    },
    openaiThinking: normalizeOpenAIThinking(settings.openaiThinking),
    imageryPauseMode: normalizeImageryPauseMode(settings.imageryPauseMode),
    deployTokens: { ...settings.deployTokens },
    updatedAt: settings.updatedAt,
  };
}

function parseSettingsPayload(payload: string): SettingsPayload | null {
  try {
    const parsed = JSON.parse(payload);
    if (!isSettingsPayload(parsed)) {
      return null;
    }
    const defaults = buildDefaultSettings();
    return {
      ...defaults,
      ...parsed,
      llmKeys: normalizeLlmKeys(parsed.llmKeys),
      llmModels: {
        ...defaults.llmModels,
        ...parsed.llmModels,
        chat: { ...defaults.llmModels.chat, ...parsed.llmModels?.chat },
        builder: { ...defaults.llmModels.builder, ...parsed.llmModels?.builder },
        critic: { ...defaults.llmModels.critic, ...parsed.llmModels?.critic },
        imaging: { ...defaults.llmModels.imaging, ...parsed.llmModels?.imaging },
      },
      openaiThinking: normalizeOpenAIThinking(parsed.openaiThinking),
      imageryPauseMode: normalizeImageryPauseMode(parsed.imageryPauseMode),
      deployTokens: { ...defaults.deployTokens, ...parsed.deployTokens },
    };
  } catch (error) {
    return null;
  }
}

function isSettingsPayload(value: unknown): value is SettingsPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (value.version !== 1) {
    return false;
  }
  if (!isNumber(value.updatedAt)) {
    return false;
  }
  if (!isRecord(value.llmKeys)) {
    return false;
  }
  if (!isProviderKey(value.llmKeys.openai)) {
    return false;
  }
  if (!isProviderKey(value.llmKeys.anthropic)) {
    return false;
  }
  if (!isProviderKey(value.llmKeys.google)) {
    return false;
  }
  if (!isRecord(value.llmModels)) {
    return false;
  }
  if (!isModelSelection(value.llmModels.chat)) {
    return false;
  }
  if (!isModelSelection(value.llmModels.builder)) {
    return false;
  }
  if (hasValue(value.llmModels, 'critic') && !isModelSelection(value.llmModels.critic)) {
    return false;
  }
  if (hasValue(value.llmModels, 'imaging') && !isModelSelection(value.llmModels.imaging)) {
    return false;
  }
  if (
    hasValue(value, 'openaiThinking') &&
    !isOpenAIThinkingSettings(value.openaiThinking)
  ) {
    return false;
  }
  if (hasValue(value, 'imageryPauseMode') && !isImageryPauseMode(value.imageryPauseMode)) {
    return false;
  }
  if (!isRecord(value.deployTokens)) {
    return false;
  }
  if (!isDeployToken(value.deployTokens.github)) {
    return false;
  }
  if (!isDeployToken(value.deployTokens.cloudflare)) {
    return false;
  }
  if (!isDeployToken(value.deployTokens.netlify)) {
    return false;
  }
  if (!isDeployToken(value.deployTokens.vercel)) {
    return false;
  }
  return true;
}

function isOpenAIThinkingSettings(value: unknown): value is OpenAIThinkingSettings {
  if (!isRecord(value)) {
    return false;
  }
  if (!isOpenAIReasoningSetting(value.chat)) {
    return false;
  }
  if (!isOpenAIReasoningSetting(value.builder)) {
    return false;
  }
  if (hasValue(value, 'critic') && !isOpenAIReasoningSetting(value.critic)) {
    return false;
  }
  return true;
}

function normalizeOpenAIThinking(value: unknown): OpenAIThinkingSettings {
  const defaults = runtimeConfig.settingsDefaults.openAIReasoning;
  if (!isRecord(value)) {
    return {
      chat: defaults.chat,
      builder: defaults.builder,
      critic: defaults.critic,
    };
  }
  return {
    chat: isOpenAIReasoningSetting(value.chat) ? value.chat : defaults.chat,
    builder: isOpenAIReasoningSetting(value.builder)
      ? value.builder
      : defaults.builder,
    critic: isOpenAIReasoningSetting(value.critic)
      ? value.critic
      : defaults.critic,
  };
}

function normalizeImageryPauseMode(value: unknown): ImageryPauseMode {
  return isImageryPauseMode(value) ? value : 'balanced';
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

function isImageryPauseMode(value: unknown): value is ImageryPauseMode {
  return value === 'strict' || value === 'balanced' || value === 'lenient';
}

function isModelSelection(value: unknown): value is ModelSelection {
  if (!isRecord(value)) {
    return false;
  }
  if (!isProvider(value.provider)) {
    return false;
  }
  if (!isString(value.model)) {
    return false;
  }
  return true;
}

function isProvider(value: unknown): value is LLMProviderName {
  return value === 'openai' || value === 'anthropic' || value === 'google';
}

function isProviderKey(value: unknown): value is string {
  return isString(value);
}

function normalizeLlmKeys(
  llmKeys: SettingsPayload['llmKeys'],
): SettingsPayload['llmKeys'] {
  const next = { ...llmKeys };
  if (runtimeConfig.openAIRequestMode === 'proxy') {
    // OpenAI credentials are server-managed in proxy mode.
    next.openai = '';
  }
  return next;
}

function isDeployToken(value: unknown): value is string {
  return isString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasValue(
  record: Record<string, unknown>,
  key: string,
): boolean {
  return record[key] !== undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}
