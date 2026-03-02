import { describe, expect, it, vi } from 'vitest';

import {
  createOpenAIKeyValidationRunner,
  validateOpenAIKey,
} from '../../../src/engine/llm/openai-key-validation';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function createMockResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => null,
    },
  } as Response;
}

function createAbortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function readHeader(
  headers: HeadersInit | undefined,
  key: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined;
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([header]) => header.toLowerCase() === key.toLowerCase());
    return found?.[1];
  }

  const record = headers as Record<string, string | undefined>;
  return record[key] ?? record[key.toLowerCase()];
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('validateOpenAIKey', () => {
  it('maps status 200 to a valid result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createMockResponse(200));
    const fetchFn = fetchMock as unknown as FetchFn;

    const result = await validateOpenAIKey('sk-valid-1234567890', { fetchFn, now: () => 1234 });

    expect(result.status).toBe('valid');
    expect(result.code).toBe('valid');
    expect(result.httpStatus).toBe(200);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toBe('https://api.openai.com/v1/models');
    expect((requestInit as RequestInit).method).toBe('GET');
    expect(readHeader((requestInit as RequestInit).headers, 'Authorization')).toBe(
      'Bearer sk-valid-1234567890',
    );
  });

  it('maps status 401/403 to invalid auth results', async () => {
    const fetchMock401 = vi.fn().mockResolvedValue(createMockResponse(401));
    const fetchMock403 = vi.fn().mockResolvedValue(createMockResponse(403));
    const fetchFn401 = fetchMock401 as unknown as FetchFn;
    const fetchFn403 = fetchMock403 as unknown as FetchFn;

    const result401 = await validateOpenAIKey('sk-invalid', { fetchFn: fetchFn401 });
    const result403 = await validateOpenAIKey('sk-forbidden', { fetchFn: fetchFn403 });

    expect(result401.status).toBe('invalid');
    expect(result401.code).toBe('auth_invalid');
    expect(result401.httpStatus).toBe(401);
    expect(result403.status).toBe('invalid');
    expect(result403.code).toBe('auth_invalid');
    expect(result403.httpStatus).toBe(403);
  });

  it('maps status 429 to a rate-limit error result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createMockResponse(429));
    const fetchFn = fetchMock as unknown as FetchFn;

    const result = await validateOpenAIKey('sk-rate-limited', { fetchFn });

    expect(result.status).toBe('error');
    expect(result.code).toBe('rate_limited');
    expect(result.httpStatus).toBe(429);
  });

  it('maps non-auth, non-429 statuses to service errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createMockResponse(503));
    const fetchFn = fetchMock as unknown as FetchFn;

    const result = await validateOpenAIKey('sk-service', { fetchFn });

    expect(result.status).toBe('error');
    expect(result.code).toBe('service_error');
    expect(result.httpStatus).toBe(503);
  });

  it('maps fetch failures to connectivity errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const fetchFn = fetchMock as unknown as FetchFn;

    const result = await validateOpenAIKey('sk-network', { fetchFn });

    expect(result.status).toBe('error');
    expect(result.code).toBe('connectivity_error');
    expect(result.httpStatus).toBeUndefined();
  });

  it('returns timeout errors when request exceeds timeoutMs', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(createAbortError());
            },
            { once: true },
          );
        });
      }) as unknown as FetchFn;

      const validationPromise = validateOpenAIKey('sk-timeout', {
        fetchFn,
        timeoutMs: 50,
        now: () => 555,
      });
      await vi.advanceTimersByTimeAsync(60);
      const result = await validationPromise;

      expect(result.status).toBe('error');
      expect(result.code).toBe('timeout');
      expect(result.checkedAt).toBe(555);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createOpenAIKeyValidationRunner', () => {
  it('suppresses stale responses when a newer request starts', async () => {
    const first = createDeferred<Response>();
    const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = readHeader(init?.headers, 'Authorization');
      if (authorization === 'Bearer sk-first') {
        return first.promise;
      }
      return Promise.resolve(createMockResponse(200));
    }) as unknown as FetchFn;

    const runner = createOpenAIKeyValidationRunner({ fetchFn, now: () => 2000 });

    const firstValidation = runner.validate('sk-first');
    const secondValidation = runner.validate('sk-second');

    first.resolve(createMockResponse(401));

    const [firstResult, secondResult] = await Promise.all([firstValidation, secondValidation]);

    expect(firstResult.status).toBe('aborted');
    expect(firstResult.code).toBe('aborted');
    expect(firstResult.message).toContain('stale');
    expect(secondResult.status).toBe('valid');
    expect(secondResult.code).toBe('valid');
  });

  it('cancels in-flight validation requests', async () => {
    const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            reject(createAbortError());
          },
          { once: true },
        );
      });
    }) as unknown as FetchFn;

    const runner = createOpenAIKeyValidationRunner({ fetchFn, now: () => 3000 });
    const pendingValidation = runner.validate('sk-cancel');
    runner.cancel();

    const result = await pendingValidation;
    expect(result.status).toBe('aborted');
    expect(result.code).toBe('aborted');
  });
});
