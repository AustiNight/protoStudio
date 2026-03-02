import pricingConfigJson from '../../config/model-pricing.json';
import { isPricingConfig } from '../../config/model-pricing-schema';
import type { CostCalculation } from '../../types/llm';
import type { PricingConfig, TokenUsage } from '../../types/pricing';

const pricingConfig = normalizePricingConfig(pricingConfigJson);

/**
 * Calculate the USD cost for a model call.
 */
export function calculateCost(model: string, usage: TokenUsage): CostCalculation {
  const rates = pricingConfig.models[model];
  if (!rates) {
    return { cost: 0, unknownModel: true };
  }

  const promptCost = (usage.promptTokens / 1000) * rates.promptPer1K;
  const completionCost =
    (usage.completionTokens / 1000) * rates.completionPer1K;

  return {
    cost: promptCost + completionCost,
    unknownModel: false,
  };
}

/**
 * Pricing table last-updated stamp.
 */
export function getPricingLastUpdated(): string {
  return pricingConfig.lastUpdated;
}

function normalizePricingConfig(value: unknown): PricingConfig {
  if (isPricingConfig(value)) {
    return value;
  }

  return {
    lastUpdated: 'unknown',
    models: {},
  };
}
