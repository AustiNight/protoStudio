import type { Result } from '../../types/result';
import type {
  LLMError,
  LLMGatewayTelemetry,
  LLMMessage,
  LLMProviderClient,
  LLMRequest,
  LLMResponse,
  LLMRunningTotal,
} from '../../types/llm';
import type { LLMConfig, LLMModelSelection, LLMProviderName } from '../../types/session';
import { calculateCost } from './cost';
import { AnthropicProvider } from './providers/anthropic';
import { GoogleProvider } from './providers/google';
import { OpenAIProvider } from './providers/openai';

interface LLMGatewayOptions {
  providers?: Partial<Record<LLMProviderName, LLMProviderClient>>;
  telemetry?: LLMGatewayTelemetry;
}

export class LLMGateway {
  private config: LLMConfig;
  private providers: Partial<Record<LLMProviderName, LLMProviderClient>>;
  private telemetry?: LLMGatewayTelemetry;
  private runningTotal: LLMRunningTotal;

  constructor(config: LLMConfig, options?: LLMGatewayOptions) {
    this.config = config;
    this.providers = {
      openai: new OpenAIProvider(),
      anthropic: new AnthropicProvider(),
      google: new GoogleProvider(),
      ...options?.providers,
    };
    this.telemetry = options?.telemetry;
    this.runningTotal = { chat: 0, builder: 0, total: 0 };
  }

  async send(request: LLMRequest): Promise<Result<LLMResponse, LLMError>> {
    const selection = this.getConfigForRole(request.role);
    const providerName = selection.provider.name;
    const provider = this.providers[providerName];

    if (!provider) {
      const error = buildProviderMissingError(providerName);
      this.telemetry?.onError?.(request, error);
      return errResult(error);
    }

    const messages = buildMessages(request.systemPrompt, request.messages);
    this.telemetry?.onRequest?.(request, selection);

    const result = await provider.call(
      selection.provider.apiKey,
      selection.model,
      messages,
      {
        responseFormat: request.responseFormat,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      },
    );

    if (!result.ok) {
      this.telemetry?.onError?.(request, result.error);
      return result;
    }

    const costResult = calculateCost(result.value.model, result.value.usage);
    const response: LLMResponse = {
      ...result.value,
      cost: costResult.cost,
      unknownModel: costResult.unknownModel,
    };

    this.addToTotals(request.role, response.cost);
    this.telemetry?.onResponse?.(request, response);

    return okResult(response);
  }

  getRunningTotal(): LLMRunningTotal {
    return { ...this.runningTotal };
  }

  resetTotal(): void {
    this.runningTotal = { chat: 0, builder: 0, total: 0 };
  }

  private getConfigForRole(role: LLMRequest['role']): LLMModelSelection {
    return role === 'chat' ? this.config.chatModel : this.config.builderModel;
  }

  private addToTotals(role: LLMRequest['role'], cost: number): void {
    if (role === 'chat') {
      this.runningTotal.chat += cost;
    } else {
      this.runningTotal.builder += cost;
    }

    this.runningTotal.total =
      this.runningTotal.chat + this.runningTotal.builder;
  }
}

function buildMessages(systemPrompt: string, messages: LLMMessage[]): LLMMessage[] {
  const trimmedPrompt = systemPrompt.trim();
  if (!trimmedPrompt) {
    return [...messages];
  }

  return [{ role: 'system', content: trimmedPrompt }, ...messages];
}

function buildProviderMissingError(provider: LLMProviderName): LLMError {
  return {
    category: 'user_action',
    code: 'provider_error',
    message: `Provider ${provider} is not configured in the gateway.`,
    provider,
  };
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
