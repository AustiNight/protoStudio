import { resolveRuntimeFetch } from '../../utils/fetch';
import type { OpenAIRequestMode } from '../../config/runtime-config';

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PROXY_BASE_URL = '/api/openai';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type OpenAIKeyValidationStatus = 'valid' | 'invalid' | 'error' | 'aborted';

export type OpenAIKeyValidationCode =
  | 'valid'
  | 'auth_invalid'
  | 'secret_missing'
  | 'origin_blocked'
  | 'upstream_unreachable'
  | 'rate_limited'
  | 'timeout'
  | 'service_error'
  | 'connectivity_error'
  | 'aborted';

export type OpenAIKeyValidationResult = {
  status: OpenAIKeyValidationStatus;
  code: OpenAIKeyValidationCode;
  message: string;
  checkedAt: number;
  httpStatus?: number;
};

type ValidateOpenAIKeyOptions = {
  fetchFn?: FetchFn;
  now?: () => number;
  timeoutMs?: number;
  signal?: AbortSignal;
  requestMode?: OpenAIRequestMode;
  proxyBaseUrl?: string;
};

type OpenAIKeyValidationRunnerOptions = Omit<ValidateOpenAIKeyOptions, 'signal'>;

export type OpenAIKeyValidationRunner = {
  validate: (apiKey?: string) => Promise<OpenAIKeyValidationResult>;
  cancel: () => void;
  dispose: () => void;
};

export function createOpenAIKeyValidationRunner(
  options: OpenAIKeyValidationRunnerOptions = {},
): OpenAIKeyValidationRunner {
  const now = options.now ?? (() => Date.now());
  let activeRequestId = 0;
  let activeController: AbortController | null = null;

  const cancel = () => {
    activeRequestId += 1;
    activeController?.abort();
    activeController = null;
  };

  return {
    validate: async (apiKey?: string) => {
      activeRequestId += 1;
      const requestId = activeRequestId;

      activeController?.abort();
      const controller = buildAbortController();
      activeController = controller;

      const result = await validateOpenAIKey(apiKey, {
        fetchFn: options.fetchFn,
        now: options.now,
        timeoutMs: options.timeoutMs,
        signal: controller?.signal,
        requestMode: options.requestMode,
        proxyBaseUrl: options.proxyBaseUrl,
      });

      if (requestId !== activeRequestId) {
        return buildResult(
          now(),
          'aborted',
          'aborted',
          'Ignored stale OpenAI validation response.',
        );
      }

      if (activeController === controller) {
        activeController = null;
      }

      return result;
    },
    cancel,
    dispose: cancel,
  };
}

export async function validateOpenAIKey(
  apiKey = '',
  options: ValidateOpenAIKeyOptions = {},
): Promise<OpenAIKeyValidationResult> {
  const fetchFn = resolveRuntimeFetch(options.fetchFn);
  const now = options.now ?? (() => Date.now());
  if (!fetchFn) {
    return buildResult(
      now(),
      'error',
      'service_error',
      'OpenAI validation is unavailable in this environment.',
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestMode = options.requestMode ?? 'direct';
  const requestUrl =
    requestMode === 'proxy'
      ? `${normalizeProxyBaseUrl(options.proxyBaseUrl)}/v1/models`
      : OPENAI_MODELS_URL;
  const headers =
    requestMode === 'proxy' ? undefined : { Authorization: `Bearer ${apiKey}` };
  const controller = buildAbortController();
  const signal = controller?.signal ?? options.signal;

  let didTimeout = false;
  const detachExternalAbort = attachAbortSignal(options.signal, controller);
  const timeoutId =
    controller && timeoutMs > 0
      ? setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    const response = await fetchFn(requestUrl, {
      method: 'GET',
      headers,
      signal,
    });

    const bodyText = await safeReadText(response);
    return mapStatusToValidation(response.status, now(), requestMode, bodyText);
  } catch (error) {
    const checkedAt = now();
    if (didTimeout) {
      return buildResult(
        checkedAt,
        'error',
        'timeout',
        'OpenAI validation timed out. Check connectivity and try again.',
      );
    }

    if (isAbortError(error) || options.signal?.aborted) {
      return buildResult(
        checkedAt,
        'aborted',
        'aborted',
        'OpenAI validation was canceled.',
      );
    }

    return buildResult(
      checkedAt,
      'error',
      'connectivity_error',
      'Could not reach OpenAI validation. Check network/CORS and try again.',
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    detachExternalAbort();
  }
}

function normalizeProxyBaseUrl(value?: string): string {
  if (!value) {
    return DEFAULT_PROXY_BASE_URL;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_PROXY_BASE_URL;
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function mapStatusToValidation(
  status: number,
  checkedAt: number,
  requestMode: OpenAIRequestMode,
  bodyText: string,
): OpenAIKeyValidationResult {
  if (status === 200) {
    return buildResult(
      checkedAt,
      'valid',
      'valid',
      requestMode === 'proxy'
        ? 'OpenAI proxy is healthy.'
        : 'OpenAI key is valid.',
      status,
    );
  }

  const diagnosticCode = extractErrorCode(bodyText);
  if (diagnosticCode === 'secret_missing') {
    return buildResult(
      checkedAt,
      'error',
      'secret_missing',
      'OpenAI proxy is missing OPENAI_API_KEY. Set the server secret and retry.',
      status,
    );
  }
  if (diagnosticCode === 'origin_blocked') {
    return buildResult(
      checkedAt,
      'error',
      'origin_blocked',
      'OpenAI proxy blocked this origin. Check OPENAI_PROXY_ALLOWED_ORIGINS.',
      status,
    );
  }
  if (diagnosticCode === 'upstream_unreachable') {
    return buildResult(
      checkedAt,
      'error',
      'upstream_unreachable',
      'OpenAI proxy could not reach OpenAI upstream. Check egress/network and retry.',
      status,
    );
  }
  if (diagnosticCode === 'invalid_api_key' || diagnosticCode === 'auth_invalid') {
    return buildResult(
      checkedAt,
      'invalid',
      'auth_invalid',
      requestMode === 'proxy'
        ? 'OpenAI rejected the server-managed key. Rotate OPENAI_API_KEY and retry.'
        : `OpenAI rejected this key (${status}). Check key permissions and try again.`,
      status,
    );
  }

  if (status === 401 || status === 403) {
    return buildResult(
      checkedAt,
      'invalid',
      'auth_invalid',
      requestMode === 'proxy'
        ? `OpenAI proxy authentication failed (${status}). Check server OPENAI_API_KEY.`
        : `OpenAI rejected this key (${status}). Check key permissions and try again.`,
      status,
    );
  }

  if (status === 429) {
    return buildResult(
      checkedAt,
      'error',
      'rate_limited',
      'OpenAI rate-limited validation. Wait a moment, then retry.',
      status,
    );
  }

  return buildResult(
    checkedAt,
    'error',
    'service_error',
    requestMode === 'proxy'
      ? `OpenAI proxy validation failed with status ${status}.`
      : `OpenAI validation failed with status ${status}. This looks like a service/connectivity issue.`,
    status,
  );
}

function extractErrorCode(bodyText: string): string | null {
  if (!bodyText.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { code?: unknown };
      code?: unknown;
    };
    const nested = parsed.error?.code;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
    if (typeof parsed.code === 'string' && parsed.code.trim()) {
      return parsed.code.trim();
    }
  } catch {
    return null;
  }
  return null;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function buildAbortController(): AbortController | null {
  if (typeof AbortController === 'undefined') {
    return null;
  }
  return new AbortController();
}

function attachAbortSignal(
  externalSignal: AbortSignal | undefined,
  controller: AbortController | null,
): () => void {
  if (!externalSignal || !controller) {
    return () => {};
  }

  if (externalSignal.aborted) {
    controller.abort();
    return () => {};
  }

  const onAbort = () => {
    controller.abort();
  };
  externalSignal.addEventListener('abort', onAbort, { once: true });
  return () => externalSignal.removeEventListener('abort', onAbort);
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError';
  }
  return false;
}

function buildResult(
  checkedAt: number,
  status: OpenAIKeyValidationStatus,
  code: OpenAIKeyValidationCode,
  message: string,
  httpStatus?: number,
): OpenAIKeyValidationResult {
  return {
    status,
    code,
    message,
    checkedAt,
    httpStatus,
  };
}
