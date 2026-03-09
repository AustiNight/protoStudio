import type { ErrorCategory, Result } from '../../../types/result';
import type {
  LLMCallOptions,
  LLMError,
  LLMErrorCode,
  LLMMessage,
  OpenAIReasoningEffort,
  LLMProviderClient,
  RawLLMResponse,
} from '../../../types/llm';
import type { LLMProviderName } from '../../../types/session';
import { resolveRuntimeFetch } from '../../../utils/fetch';

const OPENAI_CHAT_COMPLETIONS_URL =
  'https://api.openai.com/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30_000;

interface OpenAIProviderOptions {
  fetchFn?: FetchFn;
  now?: () => number;
  timeoutMs?: number;
}

interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: OpenAIReasoningEffort;
  response_format?: {
    type: 'json_object';
  };
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class OpenAIProvider implements LLMProviderClient {
  name: LLMProviderName = 'openai';
  private fetchFn?: FetchFn;
  private now: () => number;
  private timeoutMs: number;

  constructor(options?: OpenAIProviderOptions) {
    this.fetchFn = resolveRuntimeFetch(options?.fetchFn);
    this.now = options?.now ?? (() => Date.now());
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async call(
    apiKey: string,
    model: string,
    messages: LLMMessage[],
    options: LLMCallOptions,
  ): Promise<Result<RawLLMResponse, LLMError>> {
    if (!this.fetchFn) {
      return errResult(
        buildError(
          'provider_error',
          'OpenAI fetch is not available in this environment.',
          'fatal',
        ),
      );
    }

    const payload = buildPayload(model, messages, options);
    const controller = buildAbortController();
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs)
      : null;

    const startedAt = this.now();

    let response: Response;
    try {
      response = await this.fetchFn(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (isAbortError(error)) {
        return errResult(buildError('timeout', 'OpenAI request timed out.', 'retryable'));
      }

      return errResult(
        buildError(
          'provider_error',
          'OpenAI request failed before receiving a response.',
          'retryable',
          undefined,
          undefined,
          buildConnectivityErrorDetails(error),
        ),
      );
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const latencyMs = Math.max(0, this.now() - startedAt);

    let prefetchedBodyText: string | null = null;
    if (response.status === 400) {
      prefetchedBodyText = await safeReadText(response);
      const retryPayload = buildRetryPayloadIfNeeded(
        model,
        messages,
        options,
        payload,
        prefetchedBodyText,
      );
      if (retryPayload) {
        try {
          response = await this.fetchFn(OPENAI_CHAT_COMPLETIONS_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(retryPayload),
            signal: controller?.signal,
          });
          prefetchedBodyText = null;
        } catch (error) {
          if (isAbortError(error)) {
            return errResult(buildError('timeout', 'OpenAI request timed out.', 'retryable'));
          }

          return errResult(
            buildError(
              'provider_error',
              'OpenAI request failed before receiving a response.',
              'retryable',
              undefined,
              undefined,
              buildConnectivityErrorDetails(error),
            ),
          );
        }
      }
    }

    if (response.status === 401) {
      return errResult(
        buildError('auth', 'OpenAI authentication failed.', 'user_action', 401),
      );
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
      return errResult(
        buildError(
          'rate_limit',
          'OpenAI rate limit exceeded.',
          'retryable',
          429,
          retryAfterMs,
        ),
      );
    }

    if (!response.ok) {
      const bodyText = prefetchedBodyText ?? (await safeReadText(response));
      const providerMessage = extractOpenAIErrorMessageFromBody(bodyText);
      return errResult(
        buildError(
          'provider_error',
          providerMessage
            ? `OpenAI error (${response.status}): ${providerMessage}`
            : `OpenAI error (${response.status}).`,
          errorCategoryForStatus(response.status),
          response.status,
          undefined,
          bodyText ? { body: bodyText } : undefined,
        ),
      );
    }

    const parsed = await parseOpenAIResponse(response, latencyMs);
    if (!parsed.ok) {
      return parsed;
    }

    return okResult(parsed.value);
  }
}

interface PayloadBuildOptions {
  forceCompletionTokens?: boolean;
  omitTemperature?: boolean;
  forceReasoningEffort?: OpenAIReasoningEffort | null;
}

function buildPayload(
  model: string,
  messages: LLMMessage[],
  options: LLMCallOptions,
  buildOptions?: PayloadBuildOptions,
): OpenAIChatRequest {
  const payload: OpenAIChatRequest = {
    model,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };

  if (
    typeof options.temperature === 'number' &&
    !buildOptions?.omitTemperature &&
    shouldSendTemperature(model)
  ) {
    payload.temperature = options.temperature;
  }

  if (typeof options.maxTokens === 'number') {
    if (buildOptions?.forceCompletionTokens || shouldUseMaxCompletionTokens(model)) {
      payload.max_completion_tokens = options.maxTokens;
    } else {
      payload.max_tokens = options.maxTokens;
    }
  }

  if (buildOptions?.forceReasoningEffort !== undefined) {
    if (buildOptions.forceReasoningEffort !== null) {
      payload.reasoning_effort = buildOptions.forceReasoningEffort;
    }
  } else if (options.reasoningEffort) {
    payload.reasoning_effort = options.reasoningEffort;
  }

  if (options.responseFormat === 'json') {
    payload.response_format = { type: 'json_object' };
  }

  return payload;
}

async function parseOpenAIResponse(
  response: Response,
  latencyMs: number,
): Promise<Result<RawLLMResponse, LLMError>> {
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    return errResult(
      buildError(
        'invalid_response',
        'OpenAI response was not valid JSON.',
        'retryable',
        response.status,
        undefined,
        { cause: getErrorMessage(error) },
      ),
    );
  }

  if (!isRecord(data)) {
    return errResult(
      buildError(
        'invalid_response',
        'OpenAI response was not an object.',
        'retryable',
        response.status,
      ),
    );
  }

  const model = getString(data, 'model');
  if (!model) {
    return errResult(
      buildError(
        'invalid_response',
        'OpenAI response missing model name.',
        'retryable',
        response.status,
      ),
    );
  }

  const choices = getArray(data, 'choices');
  if (!choices || choices.length === 0) {
    return errResult(
      buildError(
        'invalid_response',
        'OpenAI response missing choices.',
        'retryable',
        response.status,
      ),
    );
  }

  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) {
    return errResult(
      buildError(
        'invalid_response',
        'OpenAI response choice was malformed.',
        'retryable',
        response.status,
      ),
    );
  }

  const message = firstChoice['message'];
  if (!isRecord(message)) {
    return errResult(
      buildError(
        'invalid_response',
        'OpenAI response message was missing.',
        'retryable',
        response.status,
      ),
    );
  }

  const content = extractAssistantContent(message);
  if (content === null) {
    return errResult(
      buildError(
        'invalid_response',
        'OpenAI response content was missing.',
        'retryable',
        response.status,
      ),
    );
  }

  const usage = data['usage'];
  if (!isRecord(usage)) {
    return errResult(
      buildError(
        'invalid_response',
        'OpenAI response missing usage metrics.',
        'retryable',
        response.status,
      ),
    );
  }

  const promptTokens = getNumber(usage, 'prompt_tokens');
  const completionTokens = getNumber(usage, 'completion_tokens');
  if (promptTokens === null || completionTokens === null) {
    return errResult(
      buildError(
        'invalid_response',
        'OpenAI response usage was incomplete.',
        'retryable',
        response.status,
      ),
    );
  }

  return okResult({
    content,
    usage: {
      promptTokens,
      completionTokens,
    },
    model,
    latencyMs,
  });
}

function extractAssistantContent(message: Record<string, unknown>): string | null {
  const content = message['content'];

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const text = extractTextFromContentParts(content);
    if (text !== null) {
      return text;
    }
  }

  const refusal = getString(message, 'refusal');
  if (refusal !== null) {
    return refusal;
  }

  return null;
}

function extractTextFromContentParts(parts: unknown[]): string | null {
  const fragments: string[] = [];

  for (const part of parts) {
    if (typeof part === 'string') {
      const trimmed = part.trim();
      if (trimmed) {
        fragments.push(trimmed);
      }
      continue;
    }

    if (!isRecord(part)) {
      continue;
    }

    const candidate =
      getString(part, 'text') ??
      getString(part, 'output_text') ??
      getString(part, 'content') ??
      getString(part, 'value');
    if (!candidate) {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      fragments.push(trimmed);
    }
  }

  if (fragments.length === 0) {
    return null;
  }

  return fragments.join('\n');
}

function buildAbortController(): AbortController | null {
  if (typeof AbortController === 'undefined') {
    return null;
  }
  return new AbortController();
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number.parseInt(value, 10);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }

  return undefined;
}

async function safeReadText(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function errorCategoryForStatus(status: number): ErrorCategory {
  if (status >= 500) {
    return 'retryable';
  }
  return 'user_action';
}

function buildError(
  code: LLMErrorCode,
  message: string,
  category: ErrorCategory,
  status?: number,
  retryAfterMs?: number,
  details?: Record<string, unknown>,
): LLMError {
  return {
    category,
    code,
    message,
    provider: 'openai',
    status,
    retryAfterMs,
    details,
  };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError';
  }
  return false;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

function buildConnectivityErrorDetails(error: unknown): Record<string, unknown> {
  const cause = getErrorMessage(error);
  const details: Record<string, unknown> = { cause };

  if (error instanceof Error) {
    details.errorName = error.name;
  }

  const hint = getConnectivityHint(error, cause);
  if (hint) {
    details.hint = hint;
  }

  return details;
}

function getConnectivityHint(error: unknown, message: string): string | undefined {
  const normalized = message.trim().toLowerCase();
  const looksLikeFetchFailure =
    error instanceof TypeError ||
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('fetch failed') ||
    normalized.includes('load failed');

  if (!looksLikeFetchFailure) {
    return undefined;
  }

  return 'Request likely failed due to network/CORS before OpenAI returned a response.';
}

function shouldUseMaxCompletionTokens(model: string): boolean {
  const normalized = normalizeModel(model);
  if (!normalized) {
    return false;
  }
  return normalized.startsWith('gpt-5') || /^o[0-9]/.test(normalized);
}

function shouldSendTemperature(model: string): boolean {
  const normalized = normalizeModel(model);
  if (!normalized) {
    return true;
  }

  // GPT-5 and o-series Chat Completions currently only support default temperature.
  if (normalized.startsWith('gpt-5') || /^o[0-9]/.test(normalized)) {
    return false;
  }

  return true;
}

function shouldRetryWithMaxCompletionTokens(bodyText: string | null): boolean {
  if (!bodyText) {
    return false;
  }

  const normalized = bodyText.toLowerCase();
  return (
    normalized.includes("unsupported parameter: 'max_tokens'") &&
    normalized.includes('max_completion_tokens')
  );
}

function shouldRetryWithoutTemperature(bodyText: string | null): boolean {
  if (!bodyText) {
    return false;
  }

  const normalized = bodyText.toLowerCase();
  return (
    normalized.includes("unsupported value: 'temperature'") ||
    normalized.includes("unsupported parameter: 'temperature'") ||
    (normalized.includes('temperature') &&
      normalized.includes('only the default (1) value is supported'))
  );
}

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

function resolveRetryReasoningEffort(
  currentEffort: OpenAIReasoningEffort | undefined,
  bodyText: string | null,
): OpenAIReasoningEffort | null | undefined {
  if (!currentEffort || !bodyText) {
    return undefined;
  }

  const normalized = bodyText.toLowerCase();
  if (!normalized.includes('reasoning_effort')) {
    return undefined;
  }
  if (
    !normalized.includes('unsupported value') &&
    !normalized.includes('unsupported parameter') &&
    !normalized.includes('does not support')
  ) {
    return undefined;
  }

  const supported = parseSupportedReasoningEfforts(bodyText);
  if (supported.length === 0) {
    // If OpenAI reports unsupported reasoning effort but does not list valid values,
    // retry without overriding reasoning effort to let the model default.
    return null;
  }

  if (supported.includes(currentEffort)) {
    return undefined;
  }

  const currentIndex = OPENAI_REASONING_ORDER_INDEX.get(currentEffort);
  if (currentIndex !== undefined) {
    for (let index = currentIndex; index >= 0; index -= 1) {
      const candidate = OPENAI_REASONING_ORDER[index];
      if (supported.includes(candidate)) {
        return candidate;
      }
    }
  }

  return supported[0] ?? null;
}

function parseSupportedReasoningEfforts(bodyText: string): OpenAIReasoningEffort[] {
  const match = /supported values are:\s*([^\n.]+)/i.exec(bodyText);
  if (!match?.[1]) {
    return [];
  }

  const listSegment = match[1];
  const quotedMatches = Array.from(listSegment.matchAll(/'([^']+)'/g))
    .map((entry) => entry[1]?.trim().toLowerCase() ?? '')
    .filter((value): value is OpenAIReasoningEffort =>
      isOpenAIReasoningEffort(value),
    );

  return Array.from(new Set(quotedMatches));
}

function isOpenAIReasoningEffort(value: string): value is OpenAIReasoningEffort {
  return (
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  );
}

function buildRetryPayloadIfNeeded(
  model: string,
  messages: LLMMessage[],
  options: LLMCallOptions,
  payload: OpenAIChatRequest,
  bodyText: string | null,
): OpenAIChatRequest | null {
  const forceCompletionTokens =
    payload.max_tokens !== undefined &&
    payload.max_completion_tokens === undefined &&
    shouldRetryWithMaxCompletionTokens(bodyText);
  const omitTemperature =
    payload.temperature !== undefined && shouldRetryWithoutTemperature(bodyText);
  const forceReasoningEffort = resolveRetryReasoningEffort(
    payload.reasoning_effort,
    bodyText,
  );

  if (
    !forceCompletionTokens &&
    !omitTemperature &&
    forceReasoningEffort === undefined
  ) {
    return null;
  }

  return buildPayload(model, messages, options, {
    forceCompletionTokens,
    omitTemperature,
    forceReasoningEffort,
  });
}

function normalizeModel(model: string): string {
  return model.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function getNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

function getArray(record: Record<string, unknown>, key: string): unknown[] | null {
  const value = record[key];
  return Array.isArray(value) ? value : null;
}

function extractOpenAIErrorMessageFromBody(bodyText: string | null): string | null {
  if (!bodyText) {
    return null;
  }

  const trimmed = bodyText.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    const errorRecord = parsed.error;
    if (!isRecord(errorRecord)) {
      return null;
    }
    const message = getString(errorRecord, 'message');
    const normalized = message?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
