import { isOpenAIModelId } from '@/config/model-pricing-schema';

const OPENAI_NON_CHAT_COMPLETIONS_PATTERNS: RegExp[] = [
  /^chatgpt-/i,
  /-codex(?:$|-)/i,
  /(?:^|[-_.])image(?:[-_.]|$)/i,
  /(?:^|[-_.])audio(?:[-_.]|$)/i,
  /(?:^|[-_.])transcribe(?:[-_.]|$)/i,
  /(?:^|[-_.])tts(?:[-_.]|$)/i,
  /(?:^|[-_.])realtime(?:[-_.]|$)/i,
  /(?:^|[-_.])embedding(?:[-_.]|$)/i,
  /(?:^|[-_.])moderation(?:[-_.]|$)/i,
  /-preview$/i,
  /-search-preview$/i,
];

/**
 * True when a model id is a practical fit for our current OpenAI Chat Completions path.
 * Excludes model families we cannot route through this app today.
 */
export function isOpenAIChatCompletionsCapableModelId(modelId: string): boolean {
  const normalized = modelId.trim();
  if (!normalized || !isOpenAIModelId(normalized)) {
    return false;
  }
  return OPENAI_NON_CHAT_COMPLETIONS_PATTERNS.every(
    (pattern) => !pattern.test(normalized),
  );
}
