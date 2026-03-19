import { describe, expect, it } from 'vitest';

import pricingConfigRaw from '../../../src/config/model-pricing.json';
import {
  OPENAI_MODEL_MAX_STALE_DAYS,
  isOpenAIModelId,
  validatePricingConfig,
} from '../../../src/config/model-pricing-schema';
import type { PricingConfig } from '../../../src/types/pricing';

const pricingConfig = pricingConfigRaw as PricingConfig;

describe('model-pricing schema', () => {
  it('accepts the checked-in pricing config', () => {
    const issues = validatePricingConfig(pricingConfigRaw, {
      enforceFreshness: true,
    });
    expect(issues).toEqual([]);
  });

  it('requires OpenAI entries to include official sourceUrls and review date', () => {
    const openAIEntries = Object.entries(pricingConfig.models).filter(([modelId]) =>
      isOpenAIModelId(modelId),
    );

    expect(openAIEntries.length).toBeGreaterThan(0);
    for (const [modelId, model] of openAIEntries) {
      expect(model.sourceUrls).toBeDefined();
      expect(model.sourceUrls?.length).toBeGreaterThan(0);
      for (const sourceUrl of model.sourceUrls ?? []) {
        expect(sourceUrl).toMatch(/^https:\/\/(platform|developers)\.openai\.com\//);
      }
      expect(model.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(modelId.startsWith('gpt-') || /^o[0-9]/i.test(modelId)).toBe(true);
    }
  });

  it('flags missing metadata when an OpenAI model entry omits sourceUrls', () => {
    const sample = {
      lastUpdated: '2026-03-02',
      models: {
        'gpt-test': {
          promptPer1K: 0.001,
          completionPer1K: 0.002,
        },
      },
    };

    const issues = validatePricingConfig(sample, { enforceFreshness: true });
    expect(issues.some((issue) => issue.message.includes('sourceUrls'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('reviewedAt'))).toBe(true);
  });

  it('allows stale reviewedAt in runtime mode but flags it in guardrail mode', () => {
    const sample = {
      lastUpdated: '2025-01-01',
      models: {
        'gpt-test': {
          promptPer1K: 0.001,
          completionPer1K: 0.002,
          sourceUrls: ['https://platform.openai.com/docs/pricing'],
          reviewedAt: '2025-01-01',
        },
      },
    };

    const runtimeIssues = validatePricingConfig(sample, { enforceFreshness: false });
    expect(runtimeIssues).toEqual([]);

    const guardrailIssues = validatePricingConfig(sample, {
      enforceFreshness: true,
      now: new Date('2026-03-19T00:00:00.000Z'),
      maxStaleDays: OPENAI_MODEL_MAX_STALE_DAYS,
    });
    expect(
      guardrailIssues.some((issue) => issue.message.includes('maximum allowed')),
    ).toBe(true);
  });
});
