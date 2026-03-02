import { create } from 'zustand';

import { decrypt, encrypt, EncryptionError } from '../persistence/encryption';
import {
  clearEncryptedSettings,
  readEncryptedSettings,
  writeEncryptedSettings,
} from '../persistence/settings-storage';
import type { LLMProviderName } from '../types/session';

export type SettingsDeployHost = 'github' | 'cloudflare' | 'netlify' | 'vercel';

export interface ModelSelection {
  provider: LLMProviderName;
  model: string;
}

export interface SettingsPayload {
  version: 1;
  llmKeys: Record<LLMProviderName, string>;
  llmModels: {
    chat: ModelSelection;
    builder: ModelSelection;
  };
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
  return {
    version: 1,
    llmKeys: { openai: '', anthropic: '', google: '' },
    llmModels: {
      chat: { provider: 'openai', model: 'gpt-4o-mini' },
      builder: { provider: 'openai', model: 'gpt-4o-mini' },
    },
    deployTokens: { github: '', cloudflare: '', netlify: '', vercel: '' },
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
    llmKeys: { ...settings.llmKeys },
    llmModels: {
      chat: { ...settings.llmModels.chat },
      builder: { ...settings.llmModels.builder },
    },
    deployTokens: { ...settings.deployTokens },
    updatedAt: now,
  };
}

function cloneSettings(settings: SettingsPayload): SettingsPayload {
  return {
    version: 1,
    llmKeys: { ...settings.llmKeys },
    llmModels: {
      chat: { ...settings.llmModels.chat },
      builder: { ...settings.llmModels.builder },
    },
    deployTokens: { ...settings.deployTokens },
    updatedAt: settings.updatedAt,
  };
}

function parseSettingsPayload(payload: string): SettingsPayload | null {
  try {
    const parsed = JSON.parse(payload);
    return isSettingsPayload(parsed) ? parsed : null;
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

function isDeployToken(value: unknown): value is string {
  return isString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
