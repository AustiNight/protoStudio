import pricingConfigJson from '../../config/model-pricing.json';
import { isPricingConfig } from '../../config/model-pricing-schema';
import type { CostCalculation } from '../../types/llm';
import type { ModelPricing, PricingConfig, TokenUsage } from '../../types/pricing';

const pricingConfig = normalizePricingConfig(pricingConfigJson);
const EXPLICIT_MODEL_PRICE_ALIASES: Record<string, string> = {
  // Temporary compatibility alias until official pricing table includes this id directly.
  'gpt-5.3-chat-latest': 'gpt-5',
};

export interface PricingResolution {
  modelId: string;
  estimated: boolean;
}

/**
 * Calculate the USD cost for a model call.
 */
export function calculateCost(model: string, usage: TokenUsage): CostCalculation {
  const resolved = resolvePricingModel(model);
  if (!resolved) {
    return { cost: 0, unknownModel: true };
  }

  const rates = resolved.rates;
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

/**
 * Resolve a model id to the pricing model id used for cost calculations.
 */
export function resolvePricingModelId(model: string): PricingResolution | null {
  const resolved = resolvePricingModel(model);
  if (!resolved) {
    return null;
  }
  return {
    modelId: resolved.modelId,
    estimated: resolved.estimated,
  };
}

interface ResolvedPricingModel extends PricingResolution {
  rates: ModelPricing;
}

function resolvePricingModel(model: string): ResolvedPricingModel | null {
  const normalized = normalizeModelId(model);
  if (!normalized) {
    return null;
  }

  const exactRates = pricingConfig.models[normalized];
  if (exactRates) {
    return {
      modelId: normalized,
      estimated: false,
      rates: exactRates,
    };
  }

  const explicitAlias = EXPLICIT_MODEL_PRICE_ALIASES[normalized];
  if (explicitAlias) {
    const aliasRates = pricingConfig.models[explicitAlias];
    if (aliasRates) {
      return {
        modelId: explicitAlias,
        estimated: true,
        rates: aliasRates,
      };
    }
  }

  const trimmedLatest = stripLatestSuffix(normalized);
  if (trimmedLatest !== normalized) {
    const latestRates = pricingConfig.models[trimmedLatest];
    if (latestRates) {
      return {
        modelId: trimmedLatest,
        estimated: true,
        rates: latestRates,
      };
    }
  }

  const strippedVersion = stripNumericVersionSuffix(trimmedLatest);
  if (strippedVersion !== trimmedLatest) {
    const versionRates = pricingConfig.models[strippedVersion];
    if (versionRates) {
      return {
        modelId: strippedVersion,
        estimated: true,
        rates: versionRates,
      };
    }
  }

  const prefixFallback = resolveLongestKnownPrefix(strippedVersion);
  if (prefixFallback) {
    const prefixRates = pricingConfig.models[prefixFallback];
    if (prefixRates) {
      return {
        modelId: prefixFallback,
        estimated: true,
        rates: prefixRates,
      };
    }
  }

  const familyFallback = resolveOpenAIFamilyFallback(strippedVersion);
  if (familyFallback) {
    const familyRates = pricingConfig.models[familyFallback];
    if (familyRates) {
      return {
        modelId: familyFallback,
        estimated: true,
        rates: familyRates,
      };
    }
  }

  return null;
}

function normalizeModelId(model: string): string {
  return model.trim().toLowerCase();
}

function stripLatestSuffix(model: string): string {
  return model.replace(/-chat-latest$/i, '').replace(/-latest$/i, '');
}

function stripNumericVersionSuffix(model: string): string {
  let candidate = model;
  while (/-\d{2,}$/i.test(candidate)) {
    const next = candidate.replace(/-\d{2,}$/i, '');
    candidate = next;
    if (candidate in pricingConfig.models) {
      return candidate;
    }
  }
  return candidate;
}

function resolveLongestKnownPrefix(model: string): string | null {
  const candidates = Object.keys(pricingConfig.models)
    .filter((known) => model.startsWith(`${known}-`))
    .sort((left, right) => right.length - left.length);
  return candidates[0] ?? null;
}

function resolveOpenAIFamilyFallback(model: string): string | null {
  const gptMatch = /^gpt-(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-.+)?$/i.exec(model);
  if (gptMatch) {
    const major = gptMatch[1];
    const minor = gptMatch[2];
    const candidates = [
      minor ? `gpt-${major}.${minor}` : null,
      `gpt-${major}`,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      if (candidate in pricingConfig.models) {
        return candidate;
      }
    }
  }

  return null;
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
