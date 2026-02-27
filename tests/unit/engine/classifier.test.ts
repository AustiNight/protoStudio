import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ClassificationEngine } from '../../../src/engine/chat/classifier';
import type { LLMResponse } from '../../../src/types/llm';
import type { TemplateConfig, TemplateFeatureFlags } from '../../../src/types/template';

const DEFAULT_FEATURES: TemplateFeatureFlags = {
  formToEmail: false,
  mapEmbed: false,
  lightbox: false,
  cart: false,
  calendarEmbed: false,
  blogEngine: false,
  multiStepForm: false,
};

function makeTemplate(id: string, label: string, description: string): TemplateConfig {
  return {
    id,
    label,
    description,
    pages: {
      '/': {
        sections: [],
      },
    },
    features: DEFAULT_FEATURES,
    defaultTheme: {
      primary: 'var(--color-primary)',
      secondary: 'var(--color-secondary)',
      accent: 'var(--color-accent)',
      bg: 'var(--color-bg)',
      text: 'var(--color-text)',
      headingFont: 'Space Grotesk',
      bodyFont: 'Source Sans 3',
    },
  };
}

function loadFixture(name: string): LLMResponse {
  const url = new URL(
    `../../fixtures/llm-responses/classification/${name}.json`,
    import.meta.url,
  );
  const raw = readFileSync(url, 'utf-8');
  return JSON.parse(raw) as LLMResponse;
}

describe('ClassificationEngine', () => {
  it('should build a prompt that includes all template descriptions', () => {
    const engine = new ClassificationEngine();
    const templates = [
      makeTemplate('marketing', 'Marketing', 'High-converting SaaS landing pages.'),
      makeTemplate('portfolio', 'Portfolio', 'Showcase creative work with galleries.'),
    ];

    const request = engine.buildClassificationPrompt(
      'Build a landing page for my SaaS.',
      templates,
    );

    expect(request.systemPrompt).toContain('High-converting SaaS landing pages.');
    expect(request.systemPrompt).toContain('Showcase creative work with galleries.');
    expect(request.messages[0]?.content).toBe('Build a landing page for my SaaS.');
  });

  it('should parse a valid template-match response', () => {
    const engine = new ClassificationEngine();
    const response = loadFixture('template-match-marketing');

    const result = engine.parseClassificationResponse(response);

    expect(result.path).toBe('template');
    expect(result.templateId).toBe('marketing');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should parse a valid scratch-match response', () => {
    const engine = new ClassificationEngine();
    const response = loadFixture('scratch-match');

    const result = engine.parseClassificationResponse(response);

    expect(result.path).toBe('scratch');
    expect(result.templateId).toBeUndefined();
  });

  it('should extract suggested customization fields', () => {
    const engine = new ClassificationEngine();
    const response = loadFixture('template-match-portfolio');

    const result = engine.parseClassificationResponse(response);

    expect(result.suggestedCustomization?.title).toBe('Lensline Studio');
    expect(result.suggestedCustomization?.slogan).toBe('Photography that feels cinematic');
    expect(result.suggestedCustomization?.primaryColor).toBe('#1f2937');
  });

  it('should flag confidence < 0.7 for ambiguous input', () => {
    const engine = new ClassificationEngine();
    const response = loadFixture('ambiguous');

    const result = engine.parseClassificationResponse(response);

    expect(result.confidence).toBeLessThan(0.7);
    expect(result.question).toBeTruthy();
  });

  it('should handle malformed LLM response gracefully (return scratch with low confidence)', () => {
    const engine = new ClassificationEngine();
    const response: LLMResponse = {
      content: 'I think you want a blog site.',
      usage: { promptTokens: 10, completionTokens: 5 },
      model: 'gpt-test',
      latencyMs: 100,
      cost: 0,
      unknownModel: true,
    };

    const result = engine.parseClassificationResponse(response);

    expect(result.path).toBe('scratch');
    expect(result.confidence).toBeLessThan(0.3);
  });

  it('should identify marketing template from "Build a landing page for my SaaS"', () => {
    const engine = new ClassificationEngine();
    const response = loadFixture('template-match-marketing');

    const result = engine.parseClassificationResponse(response);

    expect(engine.getTemplateConfidence(result)).toBeGreaterThan(0.7);
    expect(result.templateId).toBe('marketing');
  });

  it('should identify scratch path from "Build a zodiac greeting card maker"', () => {
    const engine = new ClassificationEngine();
    const response = loadFixture('scratch-match');

    const result = engine.parseClassificationResponse(response);

    expect(result.path).toBe('scratch');
    expect(engine.getTemplateConfidence(result)).toBe(0);
  });
});
