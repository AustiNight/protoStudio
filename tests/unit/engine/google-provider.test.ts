import { describe, expect, it, vi } from 'vitest';
import { GoogleProvider } from '../../../src/engine/llm/providers/google';
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

describe('GoogleProvider', () => {
  it('should parse a successful response', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(200, {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Hello from Gemini.' }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 20,
            candidatesTokenCount: 8,
          },
          modelVersion: 'gemini-2.0-flash',
        }),
      ) as unknown as FetchFn;

    const provider = new GoogleProvider({ fetchFn });
    const result = await provider.call(
      'test-key',
      'gemini-2.0-flash',
      baseMessages,
      {},
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('Hello from Gemini.');
      expect(result.value.usage.promptTokens).toBe(20);
      expect(result.value.usage.completionTokens).toBe(8);
      expect(result.value.model).toBe('gemini-2.0-flash');
    }
  });

  it('should return authentication error when response is 401', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(createMockResponse(401, { error: 'unauthorized' })) as unknown as FetchFn;

    const provider = new GoogleProvider({ fetchFn });
    const result = await provider.call('bad-key', 'gemini-2.0-flash', baseMessages, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth');
      expect(result.error.category).toBe('user_action');
      expect(result.error.status).toBe(401);
    }
  });
});
