/**
 * Token usage captured from LLM responses.
 */
export interface TokenUsage {
  /**
   * Prompt tokens consumed by the request.
   */
  promptTokens: number;
  /**
   * Completion tokens returned by the model.
   */
  completionTokens: number;
}

/**
 * Per-model pricing rates in USD per 1K tokens.
 */
export interface ModelPricing {
  /**
   * Cost per 1K prompt tokens.
   */
  promptPer1K: number;
  /**
   * Cost per 1K completion tokens.
   */
  completionPer1K: number;
}

/**
 * Pricing configuration loaded from JSON.
 */
export interface PricingConfig {
  /**
   * Date string indicating when pricing was last updated.
   */
  lastUpdated: string;
  /**
   * Map of model id to pricing rates.
   */
  models: Record<string, ModelPricing>;
}
