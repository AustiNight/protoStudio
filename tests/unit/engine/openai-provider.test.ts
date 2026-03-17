import { describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../../src/engine/llm/providers/openai';
import type { LLMMessage } from '../../../src/types/llm';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function createMockResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => headers?.[key] ?? null,
    },
    json: async () => body,
    text: async () =>
      typeof body === 'string' ? body : JSON.stringify(body),
  } as Response;
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

const baseMessages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];

describe('OpenAIProvider', () => {
  it('should return rate limit error when response is 429', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(429, { error: 'rate limit' }, { 'Retry-After': '12' }),
      ) as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('test-key', 'gpt-4o', baseMessages, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('rate_limit');
      expect(result.error.category).toBe('retryable');
      expect(result.error.retryAfterMs).toBe(12_000);
    }
  });

  it('should return authentication error when response is 401', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(createMockResponse(401, { error: 'unauthorized' })) as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('bad-key', 'gpt-4o', baseMessages, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth');
      expect(result.error.category).toBe('user_action');
      expect(result.error.status).toBe(401);
    }
  });

  it('returns connectivity details when request fails before a response', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('test-key', 'gpt-4o', baseMessages, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('provider_error');
      expect(result.error.details).toMatchObject({
        cause: 'Failed to fetch',
        errorName: 'TypeError',
      });
      expect(typeof result.error.details?.hint).toBe('string');
    }
  });

  it('sends reasoning_effort when provided in call options', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(200, {
          model: 'gpt-4o',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    const fetchFn = fetchMock as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('test-key', 'gpt-4o', baseMessages, {
      reasoningEffort: 'high',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]?.[1];
    const parsedBody = call?.body ? JSON.parse(String(call.body)) : null;
    expect(parsedBody?.reasoning_effort).toBe('high');
  });

  it('extracts text from array-based OpenAI content parts', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(200, {
          model: 'gpt-5-mini',
          choices: [
            {
              message: {
                content: [
                  { type: 'output_text', text: 'Line one.' },
                  { type: 'output_text', text: 'Line two.' },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 2 },
        }),
      ) as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('test-key', 'gpt-5-mini', baseMessages, {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('Line one.\nLine two.');
    }
  });

  it('falls back to refusal text when content is null', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(200, {
          model: 'gpt-5-mini',
          choices: [
            {
              message: {
                content: null,
                refusal: "I can't assist with that request.",
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      ) as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('test-key', 'gpt-5-mini', baseMessages, {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain("can't assist");
    }
  });

  it('uses max_completion_tokens for GPT-5 family models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(200, {
          model: 'gpt-5.2',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    const fetchFn = fetchMock as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('test-key', 'gpt-5.2', baseMessages, {
      maxTokens: 321,
    });

    expect(result.ok).toBe(true);
    const call = fetchMock.mock.calls[0]?.[1];
    const parsedBody = call?.body ? JSON.parse(String(call.body)) : null;
    expect(parsedBody?.max_completion_tokens).toBe(321);
    expect(parsedBody?.max_tokens).toBeUndefined();
  });

  it('omits custom temperature for GPT-5 family models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(200, {
          model: 'gpt-5.3-chat-latest',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    const fetchFn = fetchMock as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call(
      'test-key',
      'gpt-5.3-chat-latest',
      baseMessages,
      { temperature: 0.2 },
    );

    expect(result.ok).toBe(true);
    const call = fetchMock.mock.calls[0]?.[1];
    const parsedBody = call?.body ? JSON.parse(String(call.body)) : null;
    expect(parsedBody?.temperature).toBeUndefined();
  });

  it('uses max_tokens for non reasoning-family models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(200, {
          model: 'gpt-4o',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    const fetchFn = fetchMock as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('test-key', 'gpt-4o', baseMessages, {
      maxTokens: 123,
    });

    expect(result.ok).toBe(true);
    const call = fetchMock.mock.calls[0]?.[1];
    const parsedBody = call?.body ? JSON.parse(String(call.body)) : null;
    expect(parsedBody?.max_tokens).toBe(123);
    expect(parsedBody?.max_completion_tokens).toBeUndefined();
  });

  it('routes through proxy mode without bearer auth header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(200, {
          model: 'gpt-4o',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    const fetchFn = fetchMock as unknown as FetchFn;

    const provider = new OpenAIProvider({
      fetchFn,
      requestMode: 'proxy',
      proxyBaseUrl: '/api/openai',
    });
    const result = await provider.call('', 'gpt-4o', baseMessages, {});

    expect(result.ok).toBe(true);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toBe('/api/openai/v1/chat/completions');
    expect(readHeader((requestInit as RequestInit).headers, 'Authorization')).toBeUndefined();
  });

  it('retries with max_completion_tokens after unsupported max_tokens 400', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse(400, {
          error: {
            message:
              "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse(200, {
          model: 'gpt-4.1',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    const fetchFn = fetchMock as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('test-key', 'gpt-4.1', baseMessages, {
      maxTokens: 456,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}'));
    expect(firstPayload.max_tokens).toBe(456);
    expect(firstPayload.max_completion_tokens).toBeUndefined();
    expect(secondPayload.max_tokens).toBeUndefined();
    expect(secondPayload.max_completion_tokens).toBe(456);
  });

  it('retries without temperature after unsupported temperature 400', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse(400, {
          error: {
            message:
              "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.",
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse(200, {
          model: 'gpt-4.1',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    const fetchFn = fetchMock as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call('test-key', 'gpt-4.1', baseMessages, {
      temperature: 0.2,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}'));
    expect(firstPayload.temperature).toBe(0.2);
    expect(secondPayload.temperature).toBeUndefined();
  });

  it('retries with a supported reasoning_effort after unsupported reasoning 400', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse(400, {
          error: {
            message:
              "Unsupported value: 'reasoning_effort' does not support 'xhigh' with this model. Supported values are: 'medium'.",
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse(200, {
          model: 'gpt-5.3-chat-latest',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    const fetchFn = fetchMock as unknown as FetchFn;

    const provider = new OpenAIProvider({ fetchFn });
    const result = await provider.call(
      'test-key',
      'gpt-5.3-chat-latest',
      baseMessages,
      { reasoningEffort: 'xhigh' },
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}'));
    expect(firstPayload.reasoning_effort).toBe('xhigh');
    expect(secondPayload.reasoning_effort).toBe('medium');
  });

  it('binds runtime fetch to avoid illegal invocation errors in browser-like environments', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const fetchMock = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        return Promise.reject(new TypeError('Illegal invocation'));
      }
      return Promise.resolve(
        createMockResponse(200, {
          model: 'gpt-4o',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    });

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    try {
      const provider = new OpenAIProvider();
      const result = await provider.call('test-key', 'gpt-4o', baseMessages, {});

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'fetch', originalDescriptor);
      } else {
        delete (globalThis as { fetch?: unknown }).fetch;
      }
    }
  });
});
