import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../../../src/engine/llm/providers/anthropic';
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

describe('AnthropicProvider', () => {
  it('should parse a successful response', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(200, {
          content: [{ type: 'text', text: 'Hello from Claude.' }],
          model: 'claude-3-5-haiku-20241022',
          usage: { input_tokens: 12, output_tokens: 34 },
        }),
      ) as unknown as FetchFn;

    const provider = new AnthropicProvider({ fetchFn });
    const result = await provider.call(
      'test-key',
      'claude-3-5-haiku-20241022',
      baseMessages,
      { maxTokens: 128 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('Hello from Claude.');
      expect(result.value.usage.promptTokens).toBe(12);
      expect(result.value.usage.completionTokens).toBe(34);
      expect(result.value.model).toBe('claude-3-5-haiku-20241022');
    }
  });

  it('should return rate limit error when response is 429', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(429, { error: 'rate limit' }, { 'Retry-After': '5' }),
      ) as unknown as FetchFn;

    const provider = new AnthropicProvider({ fetchFn });
    const result = await provider.call('test-key', 'claude-3-haiku', baseMessages, {
      maxTokens: 64,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('rate_limit');
      expect(result.error.category).toBe('retryable');
      expect(result.error.retryAfterMs).toBe(5_000);
    }
  });
});
