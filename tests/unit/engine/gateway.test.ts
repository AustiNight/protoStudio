import { describe, expect, it } from 'vitest';
import { LLMGateway } from '../../../src/engine/llm/gateway';
import type {
  LLMCallOptions,
  LLMMessage,
  LLMProviderClient,
  LLMRequest,
  RawLLMResponse,
} from '../../../src/types/llm';
import type { LLMConfig, LLMProvider } from '../../../src/types/session';

class StubProvider implements LLMProviderClient {
  name: LLMProvider['name'];
  lastCall: {
    apiKey: string;
    model: string;
    messages: LLMMessage[];
    options: LLMCallOptions;
  } | null = null;

  constructor(name: LLMProvider['name'] = 'openai') {
    this.name = name;
  }

  async call(
    apiKey: string,
    model: string,
    messages: LLMMessage[],
    options: LLMCallOptions,
  ) {
    this.lastCall = { apiKey, model, messages, options };

    const response: RawLLMResponse = {
      content: 'ok',
      usage: { promptTokens: 1000, completionTokens: 0 },
      model,
      latencyMs: 10,
    };

    return { ok: true, value: response } as const;
  }
}

function buildConfig(): LLMConfig {
  const openaiChat: LLMProvider = {
    name: 'openai',
    apiKey: 'chat-key',
    models: ['gpt-4o-mini', 'gpt-4o'],
  };
  const openaiBuilder: LLMProvider = {
    name: 'openai',
    apiKey: 'builder-key',
    models: ['gpt-4o'],
  };

  return {
    chatModel: { provider: openaiChat, model: 'gpt-4o-mini' },
    builderModel: { provider: openaiBuilder, model: 'gpt-4o' },
  };
}

function buildConfigForProvider(name: LLMProvider['name']): LLMConfig {
  const chatProvider: LLMProvider = {
    name,
    apiKey: 'chat-key',
    models: ['model-id'],
  };
  const builderProvider: LLMProvider = {
    name,
    apiKey: 'builder-key',
    models: ['model-id'],
  };

  return {
    chatModel: { provider: chatProvider, model: 'model-id' },
    builderModel: { provider: builderProvider, model: 'model-id' },
  };
}

function buildRequest(role: LLMRequest['role']): LLMRequest {
  return {
    role,
    systemPrompt: 'You are helpful.',
    messages: [{ role: 'user', content: 'Hello' }],
    responseFormat: 'text',
  };
}

describe('LLMGateway', () => {
  it('should route chat requests to chat model config when role is chat', async () => {
    const provider = new StubProvider();
    const gateway = new LLMGateway(buildConfig(), {
      providers: { openai: provider },
    });

    const result = await gateway.send(buildRequest('chat'));

    expect(result.ok).toBe(true);
    expect(provider.lastCall?.apiKey).toBe('chat-key');
    expect(provider.lastCall?.model).toBe('gpt-4o-mini');
  });

  it('should route builder requests to builder model config when role is builder', async () => {
    const provider = new StubProvider();
    const gateway = new LLMGateway(buildConfig(), {
      providers: { openai: provider },
    });

    const result = await gateway.send(buildRequest('builder'));

    expect(result.ok).toBe(true);
    expect(provider.lastCall?.apiKey).toBe('builder-key');
    expect(provider.lastCall?.model).toBe('gpt-4o');
  });

  it('should accumulate running total across multiple calls when responses succeed', async () => {
    const provider = new StubProvider();
    const gateway = new LLMGateway(buildConfig(), {
      providers: { openai: provider },
    });

    await gateway.send(buildRequest('chat'));
    await gateway.send(buildRequest('builder'));

    const totals = gateway.getRunningTotal();
    expect(totals.chat).toBeCloseTo(0.00015, 6);
    expect(totals.builder).toBeCloseTo(0.0025, 6);
    expect(totals.total).toBeCloseTo(0.00265, 6);
  });

  it('should route requests to anthropic provider when configured', async () => {
    const provider = new StubProvider('anthropic');
    const gateway = new LLMGateway(buildConfigForProvider('anthropic'), {
      providers: { anthropic: provider },
    });

    const result = await gateway.send(buildRequest('chat'));

    expect(result.ok).toBe(true);
    expect(provider.lastCall?.apiKey).toBe('chat-key');
    expect(provider.lastCall?.model).toBe('model-id');
  });

  it('should route requests to google provider when configured', async () => {
    const provider = new StubProvider('google');
    const gateway = new LLMGateway(buildConfigForProvider('google'), {
      providers: { google: provider },
    });

    const result = await gateway.send(buildRequest('builder'));

    expect(result.ok).toBe(true);
    expect(provider.lastCall?.apiKey).toBe('builder-key');
    expect(provider.lastCall?.model).toBe('model-id');
  });
});
