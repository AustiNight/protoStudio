import { beforeEach, describe, expect, it } from 'vitest';
import {
  SETTINGS_STORAGE_KEY,
} from '../../../src/persistence/settings-storage';
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
      critic: { provider: 'openai', model: 'gpt-4o-mini' },
    },
    openaiThinking: {
      chat: 'default',
      builder: 'default',
      critic: 'default',
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
    installLocalStorage(new MemoryStorage());
  });

  it('should persist settings to localStorage on change', async () => {
    const store = createSettingsStore();
    const payload = buildSettingsPayload();

    const saved = await store.getState().saveSettings(payload);

    expect(saved).toBe(true);
    const storedPayload = globalThis.localStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(storedPayload).not.toBeNull();
    if (!storedPayload) {
      return;
    }

    const parsed = JSON.parse(storedPayload) as SettingsPayload;
    expect(parsed.llmKeys.openai).toBe('');
    expect(parsed.deployTokens.github).toBe('ghp-token');
  });

  it('should hydrate settings from localStorage on creation', async () => {
    const seedStore = createSettingsStore();
    await seedStore.getState().saveSettings(buildSettingsPayload());

    const nextStore = createSettingsStore();
    nextStore.getState().hydrateFromStorage();
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
    expect(nextSettings.llmKeys.openai).toBe('');
    expect(nextSettings.llmModels.chat).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });
    expect(nextSettings.deployTokens.github).toBe('github_pat_runtime01234567890123');
    expect(nextSettings.updatedAt).toBe(1700000000000);
    expect(globalThis.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
