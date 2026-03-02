const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const DEFAULT_TIMEOUT_MS = 10_000;

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type OpenAIKeyValidationStatus = 'valid' | 'invalid' | 'error' | 'aborted';

export type OpenAIKeyValidationCode =
  | 'valid'
  | 'auth_invalid'
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
};

type OpenAIKeyValidationRunnerOptions = Omit<ValidateOpenAIKeyOptions, 'signal'>;

export type OpenAIKeyValidationRunner = {
  validate: (apiKey: string) => Promise<OpenAIKeyValidationResult>;
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
    validate: async (apiKey: string) => {
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
  apiKey: string,
  options: ValidateOpenAIKeyOptions = {},
): Promise<OpenAIKeyValidationResult> {
  const fetchFn = options.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
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
    const response = await fetchFn(OPENAI_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
    });

    return mapStatusToValidation(response.status, now());
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

function mapStatusToValidation(
  status: number,
  checkedAt: number,
): OpenAIKeyValidationResult {
  if (status === 200) {
    return buildResult(checkedAt, 'valid', 'valid', 'OpenAI key is valid.', status);
  }

  if (status === 401 || status === 403) {
    return buildResult(
      checkedAt,
      'invalid',
      'auth_invalid',
      `OpenAI rejected this key (${status}). Check key permissions and try again.`,
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
    `OpenAI validation failed with status ${status}. This looks like a service/connectivity issue.`,
    status,
  );
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
