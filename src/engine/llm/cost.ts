import pricingConfigJson from '../../config/model-pricing.json';
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

function isPricingConfig(value: unknown): value is PricingConfig {
  if (!isRecord(value)) {
    return false;
  }

  const lastUpdated = value['lastUpdated'];
  if (typeof lastUpdated !== 'string') {
    return false;
  }

  const models = value['models'];
  if (!isRecord(models)) {
    return false;
  }

  for (const entry of Object.values(models)) {
    if (!isRecord(entry)) {
      return false;
    }

    if (typeof entry['promptPer1K'] !== 'number') {
      return false;
    }

    if (typeof entry['completionPer1K'] !== 'number') {
      return false;
    }
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
