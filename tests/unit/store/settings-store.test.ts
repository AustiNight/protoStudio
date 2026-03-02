import { beforeEach, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';

import {
  SETTINGS_STORAGE_KEY,
} from '../../../src/persistence/settings-storage';
import { decrypt } from '../../../src/persistence/encryption';
import {
  createSettingsStore,
  type SettingsPayload,
} from '../../../src/store/settings-store';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function installLocalStorage(storage: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });
}

function ensureCrypto(): void {
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
    });
  }
}

function buildSettingsPayload(): SettingsPayload {
  return {
    version: 1,
    llmKeys: {
      openai: 'sk-openai',
      anthropic: 'sk-anthropic',
      google: 'sk-google',
    },
    llmModels: {
      chat: { provider: 'openai', model: 'gpt-4o-mini' },
      builder: { provider: 'openai', model: 'gpt-4o-mini' },
    },
    deployTokens: {
      github: 'ghp-token',
      cloudflare: 'cf-token',
      netlify: 'ntl-token',
      vercel: 'vercel-token',
    },
    updatedAt: 0,
  };
}

describe('settings-store', () => {
  beforeEach(() => {
    ensureCrypto();
    installLocalStorage(new MemoryStorage());
  });

  it('should persist settings to localStorage on change', async () => {
    const store = createSettingsStore();
    const passphrase = 'correct horse battery staple';
    const payload = buildSettingsPayload();

    const saved = await store.getState().saveSettings(payload, passphrase);

    expect(saved).toBe(true);
    const storedCiphertext = globalThis.localStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(storedCiphertext).not.toBeNull();
    if (!storedCiphertext) {
      return;
    }

    const decrypted = await decrypt(storedCiphertext, passphrase);
    const parsed = JSON.parse(decrypted) as SettingsPayload;
    expect(parsed.llmKeys.openai).toBe('sk-openai');
    expect(parsed.deployTokens.github).toBe('ghp-token');
  });

  it('should hydrate settings from localStorage on creation', async () => {
    const seedStore = createSettingsStore();
    const passphrase = 'correct horse battery staple';
    await seedStore.getState().saveSettings(buildSettingsPayload(), passphrase);

    const nextStore = createSettingsStore();
    const storedCiphertext = globalThis.localStorage.getItem(SETTINGS_STORAGE_KEY);

    expect(nextStore.getState().hasStoredSecrets).toBe(true);
    expect(nextStore.getState().encryptedSettings).toBe(storedCiphertext);

    const unlocked = await nextStore.getState().unlockSettings(passphrase);
    expect(unlocked).toBe(true);
    expect(nextStore.getState().settings.llmKeys.anthropic).toBe('sk-anthropic');
  });

  it('should update runtime settings in store without persisting until save', () => {
    const store = createSettingsStore();
    const runtimeSeed: SettingsPayload = {
      ...buildSettingsPayload(),
      updatedAt: 1700000000000,
    };
    store.getState().setRuntimeSettings(runtimeSeed);

    store.getState().updateRuntimeSettings((current) => ({
      ...current,
      llmKeys: { ...current.llmKeys, openai: 'sk-runtime-openai' },
      llmModels: {
        ...current.llmModels,
        chat: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        },
      },
      deployTokens: {
        ...current.deployTokens,
        github: 'github_pat_runtime01234567890123',
      },
    }));

    const nextSettings = store.getState().settings;
    expect(nextSettings.llmKeys.openai).toBe('sk-runtime-openai');
    expect(nextSettings.llmModels.chat).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });
    expect(nextSettings.deployTokens.github).toBe('github_pat_runtime01234567890123');
    expect(nextSettings.updatedAt).toBe(1700000000000);
    expect(globalThis.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
