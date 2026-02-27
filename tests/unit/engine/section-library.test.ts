import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SectionLibrary } from '../../../src/engine/templates/section-library';
import type { SectionDefinition } from '../../../src/types/template';

const SECTION_ROOT = '../../../src/engine/templates/sections';

function readSectionAsset(relativePath: string): string {
  return readFileSync(new URL(`${SECTION_ROOT}/${relativePath}`, import.meta.url), 'utf-8');
}

describe('Section library', () => {
  it('should load all 5 universal sections', () => {
    const library = new SectionLibrary();
    const ids = library
      .getSectionsByCategory('universal')
      .map((section) => section.id)
      .sort((a, b) => a.localeCompare(b));

    expect(ids).toEqual(['contact', 'footer', 'hero', 'nav', 'seo-base']);
  });

  it('should validate section HTML contains correct PP:SECTION anchors', () => {
    const library = new SectionLibrary();
    const sections = library.getSectionsByCategory('universal');

    sections.forEach((section) => {
      const html = readSectionAsset(section.files.html);
      expect(html).toContain(`<!-- PP:SECTION:${section.anchors.sectionId} -->`);
      expect(html).toContain(`<!-- /PP:SECTION:${section.anchors.sectionId} -->`);
      expect(html).toContain(`data-pp-section="${section.anchors.sectionId}"`);
    });
  });

  it('should validate section CSS contains correct PP:BLOCK anchors', () => {
    const library = new SectionLibrary();
    const sections = library.getSectionsByCategory('universal');

    sections.forEach((section) => {
      const css = readSectionAsset(section.files.css);
      expect(css).toContain(`/* === PP:BLOCK:${section.anchors.cssBlockId} === */`);
      expect(css).toContain(`/* === /PP:BLOCK:${section.anchors.cssBlockId} === */`);
    });
  });

  it('should validate CSS uses only var(--*) for colors (no hardcoded hex)', () => {
    const library = new SectionLibrary();
    const sections = library.getSectionsByCategory('universal');
    const hardcodedColor = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

    sections.forEach((section) => {
      const css = readSectionAsset(section.files.css);
      expect(hardcodedColor.test(css)).toBe(false);
    });
  });

  it('should reject a section definition missing required fields', () => {
    const library = new SectionLibrary();
    const result = library.validateSection({} as unknown as SectionDefinition);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'id')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'name')).toBe(true);
  });
});
