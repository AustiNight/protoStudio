import type { TokenUsage } from './pricing';
import type { AppError, Result } from './result';
import type { LLMModelSelection, LLMProviderName } from './session';

/**
 * Supported LLM roles within the studio.
 */
export type LLMRole = 'chat' | 'builder';

/**
 * Supported response formats for LLM calls.
 */
export type LLMResponseFormat = 'text' | 'json';

/**
 * Message roles supported by chat-style LLMs.
 */
export type LLMMessageRole = 'system' | 'user' | 'assistant';

/**
 * A single message sent to the LLM.
 */
export interface LLMMessage {
  /**
   * Role of the message within the prompt.
   */
  role: LLMMessageRole;
  /**
   * Text content of the message.
   */
  content: string;
}

/**
 * Request payload for a gateway call.
 */
export interface LLMRequest {
  /**
   * Which LLM role should handle the request.
   */
  role: LLMRole;
  /**
   * System prompt prefix for the request.
   */
  systemPrompt: string;
  /**
   * Conversation messages to send to the provider.
   */
  messages: LLMMessage[];
  /**
   * Desired response format (text or JSON).
   */
  responseFormat?: LLMResponseFormat;
  /**
   * Maximum tokens for the model response.
   */
  maxTokens?: number;
  /**
   * Temperature setting for the model.
   */
  temperature?: number;
}

/**
 * Provider-specific call options derived from the gateway request.
 */
export interface LLMCallOptions {
  /**
   * Desired response format (text or JSON).
   */
  responseFormat?: LLMResponseFormat;
  /**
   * Maximum tokens for the model response.
   */
  maxTokens?: number;
  /**
   * Temperature setting for the model.
   */
  temperature?: number;
  /**
   * Timeout budget in milliseconds.
   */
  timeoutMs?: number;
}

/**
 * Raw provider response normalized to gateway expectations.
 */
export interface RawLLMResponse {
  /**
   * Text content returned by the model.
   */
  content: string;
  /**
   * Token usage reported by the provider.
   */
  usage: TokenUsage;
  /**
   * Model identifier used for the call.
   */
  model: string;
  /**
   * Latency in milliseconds.
   */
  latencyMs: number;
}

/**
 * Cost calculation metadata.
 */
export interface CostCalculation {
  /**
   * Calculated USD cost for the call.
   */
  cost: number;
  /**
   * Whether the model pricing was unknown.
   */
  unknownModel: boolean;
}

/**
 * Unified LLM response with cost metadata.
 */
export interface LLMResponse extends RawLLMResponse {
  /**
   * Calculated USD cost for the call.
   */
  cost: number;
  /**
   * Whether the model pricing was unknown.
   */
  unknownModel: boolean;
}

/**
 * Error codes for LLM provider calls.
 */
export type LLMErrorCode =
  | 'rate_limit'
  | 'auth'
  | 'timeout'
  | 'provider_error'
  | 'invalid_response';

/**
 * Standardized LLM error payload.
 */
export interface LLMError extends AppError {
  /**
   * Error code for routing or UI messaging.
   */
  code: LLMErrorCode;
  /**
   * Provider that generated the error.
   */
  provider: LLMProviderName;
  /**
   * Optional HTTP status.
   */
  status?: number;
  /**
   * Optional retry-after value in milliseconds.
   */
  retryAfterMs?: number;
}

/**
 * Running cost totals by role.
 */
export interface LLMRunningTotal {
  /**
   * Cumulative chat cost.
   */
  chat: number;
  /**
   * Cumulative builder cost.
   */
  builder: number;
  /**
   * Combined total cost.
   */
  total: number;
}

/**
 * Telemetry callbacks for gateway activity.
 */
export interface LLMGatewayTelemetry {
  /**
   * Called before a provider request is sent.
   */
  onRequest?: (request: LLMRequest, selection: LLMModelSelection) => void;
  /**
   * Called after a provider response is received.
   */
  onResponse?: (request: LLMRequest, response: LLMResponse) => void;
  /**
   * Called when a provider request fails.
   */
  onError?: (request: LLMRequest, error: LLMError) => void;
}

/**
 * Provider interface used by the gateway.
 */
export interface LLMProviderClient {
  /**
   * Provider identifier.
   */
  name: LLMProviderName;
  /**
   * Invoke the provider and return a normalized response.
   */
  call(
    apiKey: string,
    model: string,
    messages: LLMMessage[],
    options: LLMCallOptions,
  ): Promise<Result<RawLLMResponse, LLMError>>;
}
