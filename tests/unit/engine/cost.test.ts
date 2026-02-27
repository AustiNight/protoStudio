import { describe, expect, it } from 'vitest';

import pricingConfigRaw from '../../../src/config/model-pricing.json';
import { calculateCost, getPricingLastUpdated } from '../../../src/engine/llm/cost';
import type { PricingConfig } from '../../../src/types/pricing';

const pricingConfig = pricingConfigRaw as PricingConfig;

describe('calculateCost', () => {
  it('should load pricing from JSON config file', () => {
    const rates = pricingConfig.models['gpt-4o'];
    expect(rates).toBeDefined();

    const usage = { promptTokens: 1000, completionTokens: 1000 };
    const expected =
      (usage.promptTokens / 1000) * rates.promptPer1K +
      (usage.completionTokens / 1000) * rates.completionPer1K;

    const result = calculateCost('gpt-4o', usage);

    expect(result.cost).toBeCloseTo(expected, 6);
    expect(getPricingLastUpdated()).toBe(pricingConfig.lastUpdated);
  });

  it('should calculate correct cost for gpt-4o when usage provided', () => {
    const result = calculateCost('gpt-4o', {
      promptTokens: 1000,
      completionTokens: 500,
    });

    expect(result.unknownModel).toBe(false);
    expect(result.cost).toBeCloseTo(0.0075, 6);
  });

  it('should calculate correct cost for claude-sonnet-4 when usage provided', () => {
    const result = calculateCost('claude-sonnet-4-20250514', {
      promptTokens: 2000,
      completionTokens: 1000,
    });

    expect(result.unknownModel).toBe(false);
    expect(result.cost).toBeCloseTo(0.021, 6);
  });

  it('should return zero and flag unknown model when pricing missing', () => {
    const result = calculateCost('unknown-model', {
      promptTokens: 500,
      completionTokens: 200,
    });

    expect(result.unknownModel).toBe(true);
    expect(result.cost).toBe(0);
  });
});
