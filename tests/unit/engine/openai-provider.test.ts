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
});
