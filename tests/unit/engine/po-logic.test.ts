import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildBacklogPrompt,
  evaluateReorder,
  parseBacklogResponse,
  validateAtomSizing,
} from '../../../src/engine/chat/po-logic';
import type { ClassificationResult } from '../../../src/types/chat';
import type { LLMResponse } from '../../../src/types/llm';
import type { TemplateConfig, TemplateFeatureFlags } from '../../../src/types/template';
import type { WorkItem } from '../../../src/types/backlog';

const BASE_FEATURES: TemplateFeatureFlags = {
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
      'index.html': {
        sections: ['seo-base', 'nav', 'hero', 'footer'],
      },
    },
    features: BASE_FEATURES,
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
    `../../fixtures/llm-responses/backlog/${name}.json`,
    import.meta.url,
  );
  const raw = readFileSync(url, 'utf-8');
  return JSON.parse(raw) as LLMResponse;
}

function makeWorkItem(id: string, dependencies: string[] = []): WorkItem {
  return {
    id,
    sessionId: 'session-1',
    title: id,
    description: `Do ${id}`,
    effort: 'S',
    status: 'backlog',
    order: 1,
    dependencies,
    rationale: 'Testing',
    createdAt: 1,
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 10,
    visibleChange: `Updated ${id}`,
  };
}

describe('po-logic', () => {
  it('should generate backlog prompt including atom sizing rules', () => {
    const classification: ClassificationResult = {
      path: 'template',
      templateId: 'small-business',
      confidence: 0.9,
      reasoning: 'User wants a modern small business site.',
    };
    const template = makeTemplate(
      'small-business',
      'Small Business',
      'Friendly service business layout.',
    );

    const request = buildBacklogPrompt(classification, template);

    expect(request.systemPrompt).toContain('Touches <= 5 files');
    expect(request.systemPrompt).toContain('Changes <= 150 lines');
    expect(request.systemPrompt).toContain('ONE CONCERN PER ATOM');
  });

  it('should parse valid backlog response into WorkItem array', () => {
    const response = loadFixture('small-business-decomposition');
    const items = parseBacklogResponse(response, {
      sessionId: 'session-123',
      now: () => 1_700_000_000_000,
    });

    expect(items.length).toBeGreaterThan(3);
    expect(items[0]?.title).toBe('Add services section');

    const services = items.find((item) => item.title === 'Add services section');
    const copy = items.find((item) => item.title === 'Write services copy');

    expect(copy?.dependencies).toEqual([services?.id]);

    const seoItem = items.find(
      (item) => item.title === 'Add meta descriptions to all pages',
    );
    expect(seoItem).toBeTruthy();
    expect((seoItem?.order ?? 0)).toBeGreaterThan(3);
  });

  it('should validate fixture atoms within Builder Atom limits', () => {
    const response = loadFixture('blog-decomposition');
    const items = parseBacklogResponse(response, {
      sessionId: 'session-abc',
      now: () => 1_700_000_000_000,
    });

    const result = validateAtomSizing(items);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should reject work items exceeding atom constraints', () => {
    const oversized: WorkItem = {
      ...makeWorkItem('Oversized'),
      filesTouch: ['a', 'b', 'c', 'd', 'e', 'f'],
      estimatedLines: 200,
      visibleChange: '',
    };

    const result = validateAtomSizing([oversized]);

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('should approve a valid reorder with no dependency violation', async () => {
    const itemA = makeWorkItem('A');
    const itemB = makeWorkItem('B', [itemA.id]);
    const itemC = makeWorkItem('C');

    const decision = await evaluateReorder(2, 1, [itemA, itemB, itemC]);

    expect(decision.approved).toBe(true);
    expect(decision.backlog[1]?.id).toBe('C');
  });

  it('should deny a reorder that violates dependency ordering', async () => {
    const itemA = makeWorkItem('A');
    const itemB = makeWorkItem('B', [itemA.id]);
    const itemC = makeWorkItem('C');

    const decision = await evaluateReorder(1, 0, [itemA, itemB, itemC]);

    expect(decision.approved).toBe(false);
    expect(decision.reason).toContain('must come after');
  });
});
