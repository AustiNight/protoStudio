import type { ErrorCategory, Result } from '../../../types/result';
import type {
  LLMCallOptions,
  LLMError,
  LLMErrorCode,
  LLMMessage,
  LLMProviderClient,
  RawLLMResponse,
} from '../../../types/llm';
import type { LLMProviderName } from '../../../types/session';

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
    this.fetchFn =
      options?.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
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
          { cause: getErrorMessage(error) },
        ),
      );
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const latencyMs = Math.max(0, this.now() - startedAt);

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
      const bodyText = await safeReadText(response);
      return errResult(
        buildError(
          'provider_error',
          `OpenAI error (${response.status}).`,
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

function buildPayload(
  model: string,
  messages: LLMMessage[],
  options: LLMCallOptions,
): OpenAIChatRequest {
  const payload: OpenAIChatRequest = {
    model,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };

  if (typeof options.temperature === 'number') {
    payload.temperature = options.temperature;
  }

  if (typeof options.maxTokens === 'number') {
    payload.max_tokens = options.maxTokens;
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

  const content = getString(message, 'content');
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

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
