import { create } from 'zustand';

import { runtimeConfig } from '../config/runtime-config';
import { decrypt, encrypt, EncryptionError } from '../persistence/encryption';
import {
  clearEncryptedSettings,
  readEncryptedSettings,
  writeEncryptedSettings,
} from '../persistence/settings-storage';
import type { OpenAIReasoningSetting } from '../types/llm';
import type { LLMProviderName } from '../types/session';

export type SettingsDeployHost = 'github' | 'cloudflare' | 'netlify' | 'vercel';

export interface ModelSelection {
  provider: LLMProviderName;
  model: string;
}

export interface OpenAIThinkingSettings {
  chat: OpenAIReasoningSetting;
  builder: OpenAIReasoningSetting;
}

export interface SettingsPayload {
  version: 1;
  llmKeys: Record<LLMProviderName, string>;
  llmModels: {
    chat: ModelSelection;
    builder: ModelSelection;
  };
  openaiThinking: OpenAIThinkingSettings;
  deployTokens: Record<SettingsDeployHost, string>;
  updatedAt: number;
}

export interface SettingsStoreState {
  settings: SettingsPayload;
  encryptedSettings: string | null;
  hasStoredSecrets: boolean;
  lastError: string | null;
  hydrateFromStorage: () => void;
  setRuntimeSettings: (settings: SettingsPayload) => void;
  updateRuntimeSettings: (updater: (settings: SettingsPayload) => SettingsPayload) => void;
  saveSettings: (settings: SettingsPayload, passphrase: string) => Promise<boolean>;
  unlockSettings: (passphrase: string) => Promise<boolean>;
  clearSettings: () => void;
  resetStore: () => void;
}

export const createSettingsStore = () =>
  create<SettingsStoreState>((set, get) => ({
    ...buildInitialState(),
    hydrateFromStorage: () =>
      set(() => {
        const encrypted = readEncryptedSettings();
        return {
          encryptedSettings: encrypted,
          hasStoredSecrets: Boolean(encrypted),
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
    saveSettings: async (settings, passphrase) => {
      try {
        const updatedSettings = normalizeSettings(settings);
        const payload = JSON.stringify(updatedSettings);
        const encrypted = await encrypt(payload, passphrase);
        writeEncryptedSettings(encrypted);
        set(() => ({
          settings: updatedSettings,
          encryptedSettings: encrypted,
          hasStoredSecrets: true,
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
    unlockSettings: async (passphrase) => {
      const encrypted = get().encryptedSettings ?? readEncryptedSettings();
      if (!encrypted) {
        set(() => ({
          lastError: 'No stored settings found.',
          hasStoredSecrets: false,
        }));
        return false;
      }

      try {
        const decrypted = await decrypt(encrypted, passphrase);
        const parsed = parseSettingsPayload(decrypted);
        if (!parsed) {
          set(() => ({
            lastError: 'Stored settings payload is invalid.',
          }));
          return false;
        }
        set(() => ({
          settings: parsed,
          encryptedSettings: encrypted,
          hasStoredSecrets: true,
          lastError: null,
        }));
        return true;
      } catch (error) {
        const message =
          error instanceof EncryptionError ? error.message : getErrorMessage(error);
        set(() => ({
          lastError: message,
        }));
        return false;
      }
    },
    clearSettings: () => {
      clearEncryptedSettings();
      set(() => ({
        settings: buildDefaultSettings(),
        encryptedSettings: null,
        hasStoredSecrets: false,
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
export const selectHasStoredSecrets = (state: SettingsStoreState) =>
  state.hasStoredSecrets;
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
    },
    openaiThinking: {
      chat: defaults.openAIReasoning.chat,
      builder: defaults.openAIReasoning.builder,
    },
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
  'settings' | 'encryptedSettings' | 'hasStoredSecrets' | 'lastError'
> {
  const encrypted = readEncryptedSettings();
  return {
    settings: buildDefaultSettings(),
    encryptedSettings: encrypted,
    hasStoredSecrets: Boolean(encrypted),
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
    },
    openaiThinking: normalizeOpenAIThinking(settings.openaiThinking),
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
    },
    openaiThinking: normalizeOpenAIThinking(settings.openaiThinking),
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
    return {
      ...parsed,
      llmKeys: normalizeLlmKeys(parsed.llmKeys),
      openaiThinking: normalizeOpenAIThinking(parsed.openaiThinking),
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
  if (
    hasValue(value, 'openaiThinking') &&
    !isOpenAIThinkingSettings(value.openaiThinking)
  ) {
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
  return true;
}

function normalizeOpenAIThinking(value: unknown): OpenAIThinkingSettings {
  const defaults = runtimeConfig.settingsDefaults.openAIReasoning;
  if (!isRecord(value)) {
    return {
      chat: defaults.chat,
      builder: defaults.builder,
    };
  }
  return {
    chat: isOpenAIReasoningSetting(value.chat) ? value.chat : defaults.chat,
    builder: isOpenAIReasoningSetting(value.builder)
      ? value.builder
      : defaults.builder,
  };
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
