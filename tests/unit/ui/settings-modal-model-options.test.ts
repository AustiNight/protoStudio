import { describe, expect, it } from 'vitest';

import pricingConfigRaw from '../../../src/config/model-pricing.json';
import { buildModelOptions } from '../../../src/components/shared/SettingsModal';
import type { PricingConfig } from '../../../src/types/pricing';

const pricingConfig = pricingConfigRaw as PricingConfig;

describe('buildModelOptions', () => {
  it('includes modern OpenAI model families and keeps provider boundaries', () => {
    const options = buildModelOptions(pricingConfig.models);

    expect(options.openai).toEqual(
      expect.arrayContaining([
        'gpt-5.2',
        'gpt-5.1',
        'gpt-5-mini',
        'gpt-5-nano',
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
        'gpt-4o',
        'gpt-4o-mini',
        'o3',
        'o4-mini',
      ]),
    );
    expect(options.openai.some((model) => model.startsWith('claude-'))).toBe(false);
    expect(options.openai.some((model) => model.startsWith('gemini-'))).toBe(false);

    expect(options.anthropic).toEqual(
      expect.arrayContaining(['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022']),
    );
    expect(options.anthropic.some((model) => model.startsWith('gpt-'))).toBe(false);
    expect(options.anthropic.some((model) => /^o[0-9]/i.test(model))).toBe(false);
    expect(options.anthropic.some((model) => model.startsWith('gemini-'))).toBe(false);

    expect(options.google).toEqual(
      expect.arrayContaining(['gemini-2.0-flash', 'gemini-2.5-pro']),
    );
    expect(options.google.some((model) => model.startsWith('gpt-'))).toBe(false);
    expect(options.google.some((model) => /^o[0-9]/i.test(model))).toBe(false);
    expect(options.google.some((model) => model.startsWith('claude-'))).toBe(false);
  });

  it('excludes ChatGPT-only and preview aliases from default OpenAI options', () => {
    const sampleModels: PricingConfig['models'] = {
      'gpt-5.2': { promptPer1K: 0.00175, completionPer1K: 0.014 },
      'gpt-5.2-chat-latest': { promptPer1K: 0.00175, completionPer1K: 0.014 },
      'gpt-4o-search-preview': { promptPer1K: 0.0025, completionPer1K: 0.01 },
      'chatgpt-4o-latest': { promptPer1K: 0.0025, completionPer1K: 0.01 },
      o3: { promptPer1K: 0.002, completionPer1K: 0.008 },
      'claude-test': { promptPer1K: 0.003, completionPer1K: 0.015 },
      'gemini-test': { promptPer1K: 0.00125, completionPer1K: 0.01 },
    };

    const options = buildModelOptions(sampleModels);

    expect(options.openai).toEqual(['gpt-5.2', 'o3']);
    expect(options.anthropic).toEqual(['claude-test']);
    expect(options.google).toEqual(['gemini-test']);
  });
});
