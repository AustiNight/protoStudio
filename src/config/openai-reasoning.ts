import type {
  OpenAIReasoningEffort,
  OpenAIReasoningSetting,
} from '../types/llm';

const OPENAI_REASONING_ORDER: OpenAIReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

const OPENAI_REASONING_ORDER_INDEX = new Map(
  OPENAI_REASONING_ORDER.map((effort, index) => [effort, index]),
);

const GPT_5_BASE_EFFORTS: OpenAIReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];
const GPT_5_1_EFFORTS: OpenAIReasoningEffort[] = ['none', 'low', 'medium', 'high'];
const GPT_5_2_PLUS_EFFORTS: OpenAIReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];
const GPT_5_2_PLUS_CODEX_EFFORTS: OpenAIReasoningEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
];
const GPT_5_3_CHAT_LATEST_EFFORTS: OpenAIReasoningEffort[] = ['medium'];
const O_SERIES_EFFORTS: OpenAIReasoningEffort[] = ['low', 'medium', 'high'];

export function getOpenAIReasoningEffortsForModel(
  modelId: string,
): OpenAIReasoningEffort[] {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  if (normalized === 'gpt-5.3-chat-latest') {
    return [...GPT_5_3_CHAT_LATEST_EFFORTS];
  }

  if (normalized.startsWith('gpt-5-pro')) {
    return ['high'];
  }

  if (normalized.startsWith('gpt-5')) {
    return getGpt5ReasoningEfforts(normalized);
  }

  if (isOSeriesModel(normalized)) {
    return [...O_SERIES_EFFORTS];
  }

  return [];
}

export function supportsOpenAIReasoningForModel(modelId: string): boolean {
  return getOpenAIReasoningEffortsForModel(modelId).length > 0;
}

export function getOpenAIReasoningSettingOptionsForModel(
  modelId: string,
): OpenAIReasoningSetting[] {
  const efforts = getOpenAIReasoningEffortsForModel(modelId);
  if (efforts.length === 0) {
    return [];
  }
  return ['default', ...efforts];
}

export function resolveOpenAIReasoningEffortForModel(
  modelId: string,
  setting: OpenAIReasoningSetting | undefined,
): OpenAIReasoningEffort | undefined {
  if (!setting || setting === 'default') {
    return undefined;
  }

  const supported = getOpenAIReasoningEffortsForModel(modelId);
  if (supported.length === 0) {
    return undefined;
  }

  if (supported.includes(setting)) {
    return setting;
  }

  const targetIndex = OPENAI_REASONING_ORDER_INDEX.get(setting);
  if (targetIndex === undefined) {
    return undefined;
  }

  for (let index = targetIndex; index >= 0; index -= 1) {
    const candidate = OPENAI_REASONING_ORDER[index];
    if (supported.includes(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function normalizeOpenAIReasoningSettingForModel(
  modelId: string,
  setting: OpenAIReasoningSetting,
): OpenAIReasoningSetting {
  if (setting === 'default') {
    return setting;
  }

  return resolveOpenAIReasoningEffortForModel(modelId, setting) ?? 'default';
}

function getGpt5ReasoningEfforts(modelId: string): OpenAIReasoningEffort[] {
  const minorVersion = getGpt5MinorVersion(modelId);
  const isCodex = modelId.includes('-codex');

  if (minorVersion >= 2) {
    return isCodex
      ? [...GPT_5_2_PLUS_CODEX_EFFORTS]
      : [...GPT_5_2_PLUS_EFFORTS];
  }

  if (minorVersion === 1) {
    return [...GPT_5_1_EFFORTS];
  }

  return [...GPT_5_BASE_EFFORTS];
}

function getGpt5MinorVersion(modelId: string): number {
  const match = /^gpt-5(?:\.(\d+))?/.exec(modelId);
  if (!match?.[1]) {
    return 0;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isOSeriesModel(modelId: string): boolean {
  return /^o[0-9]/.test(modelId);
}
