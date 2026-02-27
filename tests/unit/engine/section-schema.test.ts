import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validateSectionDefinition } from '../../../src/engine/templates/section-schema';

function readFixture(relativePath: string): string {
  return readFileSync(new URL(`../../fixtures/${relativePath}`, import.meta.url), 'utf-8');
}

function readJsonFixture<T>(relativePath: string): T {
  return JSON.parse(readFixture(relativePath)) as T;
}

describe('Section schema validation', () => {
  it('validates fixtures for each section category', () => {
    const fixtures = [
      'sections/universal-hero.json',
      'sections/near-universal-about.json',
      'sections/shared-faq.json',
      'sections/unique-blog-list.json',
    ];

    fixtures.forEach((fixture) => {
      const definition = readJsonFixture<unknown>(fixture);
      const result = validateSectionDefinition(definition);

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });
  });

  it('rejects invalid section definitions', () => {
    const definition = readJsonFixture<unknown>('sections/invalid-section.json');
    const result = validateSectionDefinition(definition);

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.path === 'id')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'name')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'slots[0].type')).toBe(true);
  });
});
