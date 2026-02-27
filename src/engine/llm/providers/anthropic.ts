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

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1024;

interface AnthropicProviderOptions {
  fetchFn?: FetchFn;
  now?: () => number;
  timeoutMs?: number;
  defaultMaxTokens?: number;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  temperature?: number;
  system?: string;
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class AnthropicProvider implements LLMProviderClient {
  name: LLMProviderName = 'anthropic';
  private fetchFn?: FetchFn;
  private now: () => number;
  private timeoutMs: number;
  private defaultMaxTokens: number;

  constructor(options?: AnthropicProviderOptions) {
    this.fetchFn =
      options?.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
    this.now = options?.now ?? (() => Date.now());
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultMaxTokens = options?.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
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
          'Anthropic fetch is not available in this environment.',
          'fatal',
        ),
      );
    }

    const payload = buildPayload(model, messages, options, this.defaultMaxTokens);
    const controller = buildAbortController();
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs)
      : null;

    const startedAt = this.now();

    let response: Response;
    try {
      response = await this.fetchFn(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (isAbortError(error)) {
        return errResult(
          buildError('timeout', 'Anthropic request timed out.', 'retryable'),
        );
      }

      return errResult(
        buildError(
          'provider_error',
          'Anthropic request failed before receiving a response.',
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

    if (response.status === 401 || response.status === 403) {
      return errResult(
        buildError(
          'auth',
          'Anthropic authentication failed.',
          'user_action',
          response.status,
        ),
      );
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
      return errResult(
        buildError(
          'rate_limit',
          'Anthropic rate limit exceeded.',
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
          `Anthropic error (${response.status}).`,
          errorCategoryForStatus(response.status),
          response.status,
          undefined,
          bodyText ? { body: bodyText } : undefined,
        ),
      );
    }

    const parsed = await parseAnthropicResponse(response, latencyMs);
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
  defaultMaxTokens: number,
): AnthropicRequest {
  const prepared = splitMessages(messages);

  const payload: AnthropicRequest = {
    model,
    messages: prepared.messages,
    max_tokens:
      typeof options.maxTokens === 'number' ? options.maxTokens : defaultMaxTokens,
  };

  if (prepared.system) {
    payload.system = prepared.system;
  }

  if (typeof options.temperature === 'number') {
    payload.temperature = options.temperature;
  }

  return payload;
}

function splitMessages(messages: LLMMessage[]): {
  system: string | null;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const filtered: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) {
        systemParts.push(message.content.trim());
      }
      continue;
    }

    filtered.push({
      role: message.role,
      content: message.content,
    });
  }

  const system = systemParts.length > 0 ? systemParts.join('\n') : null;
  return { system, messages: filtered };
}

async function parseAnthropicResponse(
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
        'Anthropic response was not valid JSON.',
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
        'Anthropic response was not an object.',
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
        'Anthropic response missing model name.',
        'retryable',
        response.status,
      ),
    );
  }

  const contentBlocks = getArray(data, 'content');
  if (!contentBlocks || contentBlocks.length === 0) {
    return errResult(
      buildError(
        'invalid_response',
        'Anthropic response missing content blocks.',
        'retryable',
        response.status,
      ),
    );
  }

  const textParts: string[] = [];
  for (const block of contentBlocks) {
    if (!isRecord(block)) {
      continue;
    }
    const type = getString(block, 'type');
    const text = getString(block, 'text');
    if (type === 'text' && text !== null) {
      textParts.push(text);
    }
  }

  if (textParts.length === 0) {
    return errResult(
      buildError(
        'invalid_response',
        'Anthropic response content was missing text.',
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
        'Anthropic response missing usage metrics.',
        'retryable',
        response.status,
      ),
    );
  }

  const promptTokens = getNumber(usage, 'input_tokens');
  const completionTokens = getNumber(usage, 'output_tokens');
  if (promptTokens === null || completionTokens === null) {
    return errResult(
      buildError(
        'invalid_response',
        'Anthropic response usage was incomplete.',
        'retryable',
        response.status,
      ),
    );
  }

  return okResult({
    content: textParts.join(''),
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
    provider: 'anthropic',
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
