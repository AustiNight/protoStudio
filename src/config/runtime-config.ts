import type { LLMProviderName } from '../types/session';
import type { OpenAIReasoningSetting } from '../types/llm';

type EnvValue = string | boolean | undefined;
type DeployTokenKey = 'github' | 'cloudflare' | 'netlify' | 'vercel';

interface RuntimeSettingsDefaults {
  llmKeys: Record<LLMProviderName, string>;
  deployTokens: Record<DeployTokenKey, string>;
  chatProvider: LLMProviderName;
  chatModel: string;
  builderProvider: LLMProviderName;
  builderModel: string;
  openAIReasoning: {
    chat: OpenAIReasoningSetting;
    builder: OpenAIReasoningSetting;
  };
}

export interface RuntimeConfig {
  useRealLlm: boolean;
  debugLogs: boolean;
  logViewerEnabled: boolean;
  logViewerMaxEntries: number;
  builderLoopDelayMs: number;
  previewSwapDurationMs: number;
  previewValidationDurationMs: number;
  previewIframeSandbox: string;
  settingsDefaults: RuntimeSettingsDefaults;
}

const DEFAULT_IFRAME_SANDBOX = 'allow-scripts allow-forms allow-same-origin';
const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
const DEFAULT_BUILDER_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_REASONING: OpenAIReasoningSetting = 'xhigh';

export const runtimeConfig: RuntimeConfig = {
  useRealLlm: parseBoolean(readEnv('VITE_USE_REAL_LLM'), false),
  debugLogs: parseBoolean(readEnv('VITE_DEBUG_LOGS'), false),
  logViewerEnabled: parseBoolean(readEnv('VITE_LOG_VIEWER_ENABLED'), true),
  logViewerMaxEntries: parsePositiveInt(readEnv('VITE_LOG_VIEWER_MAX_ENTRIES'), 500),
  builderLoopDelayMs: parsePositiveInt(readEnv('VITE_BUILDER_LOOP_DELAY_MS'), 220),
  previewSwapDurationMs: parsePositiveInt(readEnv('VITE_PREVIEW_SWAP_DURATION_MS'), 700),
  previewValidationDurationMs: parsePositiveInt(
    readEnv('VITE_PREVIEW_VALIDATION_DURATION_MS'),
    1200,
  ),
  previewIframeSandbox: normalizeSandbox(
    readEnv('VITE_PREVIEW_IFRAME_SANDBOX'),
    DEFAULT_IFRAME_SANDBOX,
  ),
  settingsDefaults: {
    llmKeys: {
      openai: readEnvString('VITE_OPENAI_API_KEY', ''),
      anthropic: readEnvString('VITE_ANTHROPIC_API_KEY', ''),
      google: readEnvString('VITE_GOOGLE_API_KEY', ''),
    },
    deployTokens: {
      github: readEnvString('VITE_GITHUB_TOKEN', ''),
      cloudflare: readEnvString('VITE_CLOUDFLARE_TOKEN', ''),
      netlify: readEnvString('VITE_NETLIFY_TOKEN', ''),
      vercel: readEnvString('VITE_VERCEL_TOKEN', ''),
    },
    chatProvider: parseProvider(readEnv('VITE_DEFAULT_CHAT_PROVIDER'), 'openai'),
    chatModel: readEnvString('VITE_DEFAULT_CHAT_MODEL', DEFAULT_CHAT_MODEL),
    builderProvider: parseProvider(readEnv('VITE_DEFAULT_BUILDER_PROVIDER'), 'openai'),
    builderModel: readEnvString('VITE_DEFAULT_BUILDER_MODEL', DEFAULT_BUILDER_MODEL),
    openAIReasoning: {
      chat: parseOpenAIReasoning(
        readEnv('VITE_OPENAI_CHAT_THINKING_LEVEL'),
        DEFAULT_OPENAI_REASONING,
      ),
      builder: parseOpenAIReasoning(
        readEnv('VITE_OPENAI_BUILDER_THINKING_LEVEL'),
        DEFAULT_OPENAI_REASONING,
      ),
    },
  },
};

function readEnv(key: string): EnvValue {
  const envRecord = import.meta.env as Record<string, EnvValue>;
  return envRecord[key];
}

function readEnvString(key: string, fallback: string): string {
  const value = readEnv(key);
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseBoolean(value: EnvValue, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parsePositiveInt(value: EnvValue, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseProvider(
  value: EnvValue,
  fallback: LLMProviderName,
): LLMProviderName {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'openai') {
    return 'openai';
  }
  if (normalized === 'anthropic') {
    return 'anthropic';
  }
  if (normalized === 'google') {
    return 'google';
  }
  return fallback;
}

function normalizeSandbox(value: EnvValue, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .join(' ');
  return normalized.length > 0 ? normalized : fallback;
}

function parseOpenAIReasoning(
  value: EnvValue,
  fallback: OpenAIReasoningSetting,
): OpenAIReasoningSetting {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'default' ||
    normalized === 'none' ||
    normalized === 'minimal' ||
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'xhigh'
  ) {
    return normalized;
  }

  return fallback;
}
