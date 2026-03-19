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
import { resolveOpenAIReasoningEffortForModel } from '../../config/openai-reasoning';
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
    this.runningTotal = { chat: 0, builder: 0, critic: 0, total: 0 };
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

    const modelCompatibilityError = getModelCompatibilityError(
      providerName,
      selection.model,
    );
    if (modelCompatibilityError) {
      this.telemetry?.onError?.(request, modelCompatibilityError);
      return errResult(modelCompatibilityError);
    }

    const messages = buildMessages(request.systemPrompt, request.messages);
    const reasoningEffort = resolveOpenAIReasoningEffort(
      providerName,
      selection.model,
      request.reasoningEffort,
      this.config.openAIReasoning?.[request.role],
    );
    this.telemetry?.onRequest?.(request, selection);

    const result = await provider.call(
      selection.provider.apiKey,
      selection.model,
      messages,
      {
        responseFormat: request.responseFormat,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        reasoningEffort,
      },
    );

    if (!result.ok) {
      this.telemetry?.onError?.(request, result.error);
      return result;
    }

    let costResult = calculateCost(result.value.model, result.value.usage);
    if (costResult.unknownModel) {
      const fallbackCost = calculateCost(selection.model, result.value.usage);
      if (!fallbackCost.unknownModel) {
        costResult = fallbackCost;
      }
    }
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
    this.runningTotal = { chat: 0, builder: 0, critic: 0, total: 0 };
  }

  private getConfigForRole(role: LLMRequest['role']): LLMModelSelection {
    if (role === 'chat') {
      return this.config.chatModel;
    }
    if (role === 'builder') {
      return this.config.builderModel;
    }
    return this.config.criticModel ?? this.config.chatModel;
  }

  private addToTotals(role: LLMRequest['role'], cost: number): void {
    if (role === 'chat') {
      this.runningTotal.chat += cost;
    } else if (role === 'builder') {
      this.runningTotal.builder += cost;
    } else {
      this.runningTotal.critic += cost;
    }

    this.runningTotal.total =
      this.runningTotal.chat + this.runningTotal.builder + this.runningTotal.critic;
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

function getModelCompatibilityError(
  provider: LLMProviderName,
  model: string,
): LLMError | null {
  if (
    provider === 'openai' &&
    isResponsesOnlyOpenAIModel(model)
  ) {
    return {
      category: 'user_action',
      code: 'provider_error',
      message:
        `${model} requires the OpenAI Responses API. ` +
        'This app currently uses Chat Completions for OpenAI requests.',
      provider,
    };
  }

  return null;
}

function isResponsesOnlyOpenAIModel(model: string): boolean {
  return /-codex(?:$|-)/i.test(model.trim());
}

function resolveOpenAIReasoningEffort(
  provider: LLMProviderName,
  model: string,
  requestValue: LLMRequest['reasoningEffort'],
  configValue: LLMRequest['reasoningEffort'] | undefined,
) {
  if (provider !== 'openai') {
    return undefined;
  }
  return resolveOpenAIReasoningEffortForModel(model, requestValue ?? configValue);
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
