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

const GOOGLE_GENERATE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 30_000;

interface GoogleProviderOptions {
  fetchFn?: FetchFn;
  now?: () => number;
  timeoutMs?: number;
}

interface GooglePart {
  text: string;
}

interface GoogleContent {
  role?: 'user' | 'model' | 'system';
  parts: GooglePart[];
}

interface GoogleGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: string;
}

interface GoogleRequest {
  contents: GoogleContent[];
  systemInstruction?: GoogleContent;
  generationConfig?: GoogleGenerationConfig;
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class GoogleProvider implements LLMProviderClient {
  name: LLMProviderName = 'google';
  private fetchFn?: FetchFn;
  private now: () => number;
  private timeoutMs: number;

  constructor(options?: GoogleProviderOptions) {
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
          'Google fetch is not available in this environment.',
          'fatal',
        ),
      );
    }

    const payload = buildPayload(messages, options);
    const controller = buildAbortController();
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs)
      : null;

    const startedAt = this.now();

    let response: Response;
    try {
      response = await this.fetchFn(buildUrl(model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (isAbortError(error)) {
        return errResult(buildError('timeout', 'Google request timed out.', 'retryable'));
      }

      return errResult(
        buildError(
          'provider_error',
          'Google request failed before receiving a response.',
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
        buildError('auth', 'Google authentication failed.', 'user_action', response.status),
      );
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
      return errResult(
        buildError(
          'rate_limit',
          'Google rate limit exceeded.',
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
          `Google error (${response.status}).`,
          errorCategoryForStatus(response.status),
          response.status,
          undefined,
          bodyText ? { body: bodyText } : undefined,
        ),
      );
    }

    const parsed = await parseGoogleResponse(response, latencyMs, model);
    if (!parsed.ok) {
      return parsed;
    }

    return okResult(parsed.value);
  }
}

function buildUrl(model: string): string {
  const trimmed = model.trim();
  const path = trimmed.startsWith('models/') ? trimmed : `models/${trimmed}`;
  return `${GOOGLE_GENERATE_BASE_URL}/${path}:generateContent`;
}

function buildPayload(messages: LLMMessage[], options: LLMCallOptions): GoogleRequest {
  const prepared = splitMessages(messages);

  const payload: GoogleRequest = {
    contents: prepared.contents,
  };

  if (prepared.system) {
    payload.systemInstruction = {
      parts: [{ text: prepared.system }],
    };
  }

  const generationConfig: GoogleGenerationConfig = {};

  if (typeof options.maxTokens === 'number') {
    generationConfig.maxOutputTokens = options.maxTokens;
  }

  if (typeof options.temperature === 'number') {
    generationConfig.temperature = options.temperature;
  }

  if (options.responseFormat === 'json') {
    generationConfig.responseMimeType = 'application/json';
  }

  if (Object.keys(generationConfig).length > 0) {
    payload.generationConfig = generationConfig;
  }

  return payload;
}

function splitMessages(messages: LLMMessage[]): {
  system: string | null;
  contents: GoogleContent[];
} {
  const systemParts: string[] = [];
  const contents: GoogleContent[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) {
        systemParts.push(message.content.trim());
      }
      continue;
    }

    const role = message.role === 'assistant' ? 'model' : 'user';
    contents.push({
      role,
      parts: [{ text: message.content }],
    });
  }

  const system = systemParts.length > 0 ? systemParts.join('\n') : null;
  return { system, contents };
}

async function parseGoogleResponse(
  response: Response,
  latencyMs: number,
  requestedModel: string,
): Promise<Result<RawLLMResponse, LLMError>> {
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    return errResult(
      buildError(
        'invalid_response',
        'Google response was not valid JSON.',
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
        'Google response was not an object.',
        'retryable',
        response.status,
      ),
    );
  }

  const candidates = getArray(data, 'candidates');
  if (!candidates || candidates.length === 0) {
    return errResult(
      buildError(
        'invalid_response',
        'Google response missing candidates.',
        'retryable',
        response.status,
      ),
    );
  }

  const firstCandidate = candidates[0];
  if (!isRecord(firstCandidate)) {
    return errResult(
      buildError(
        'invalid_response',
        'Google response candidate was malformed.',
        'retryable',
        response.status,
      ),
    );
  }

  const content = firstCandidate['content'];
  if (!isRecord(content)) {
    return errResult(
      buildError(
        'invalid_response',
        'Google response candidate missing content.',
        'retryable',
        response.status,
      ),
    );
  }

  const parts = getArray(content, 'parts');
  if (!parts || parts.length === 0) {
    return errResult(
      buildError(
        'invalid_response',
        'Google response content missing parts.',
        'retryable',
        response.status,
      ),
    );
  }

  const textParts: string[] = [];
  for (const part of parts) {
    if (!isRecord(part)) {
      continue;
    }
    const text = getString(part, 'text');
    if (text !== null) {
      textParts.push(text);
    }
  }

  if (textParts.length === 0) {
    return errResult(
      buildError(
        'invalid_response',
        'Google response content missing text.',
        'retryable',
        response.status,
      ),
    );
  }

  const usage = data['usageMetadata'];
  if (!isRecord(usage)) {
    return errResult(
      buildError(
        'invalid_response',
        'Google response missing usage metadata.',
        'retryable',
        response.status,
      ),
    );
  }

  const promptTokens = getNumber(usage, 'promptTokenCount');
  const completionTokens = getNumber(usage, 'candidatesTokenCount');
  if (promptTokens === null || completionTokens === null) {
    return errResult(
      buildError(
        'invalid_response',
        'Google response usage was incomplete.',
        'retryable',
        response.status,
      ),
    );
  }

  const modelVersion = getString(data, 'modelVersion');
  const responseModel = modelVersion ?? requestedModel;

  return okResult({
    content: textParts.join(''),
    usage: {
      promptTokens,
      completionTokens,
    },
    model: responseModel,
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
    provider: 'google',
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
