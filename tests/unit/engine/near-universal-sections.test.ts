import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SectionLibrary } from '../../../src/engine/templates/section-library';
import type { SectionDefinition } from '../../../src/types/template';

const SECTION_ROOT = '../../../src/engine/templates/sections';

function readSectionAsset(relativePath: string): string {
  return readFileSync(new URL(`${SECTION_ROOT}/${relativePath}`, import.meta.url), 'utf-8');
}

function expectAnchors(section: SectionDefinition, html: string, css: string): void {
  expect(html).toContain(`<!-- PP:SECTION:${section.anchors.sectionId} -->`);
  expect(html).toContain(`<!-- /PP:SECTION:${section.anchors.sectionId} -->`);
  expect(html).toContain(`data-pp-section="${section.anchors.sectionId}"`);
  expect(css).toContain(`/* === PP:BLOCK:${section.anchors.cssBlockId} === */`);
  expect(css).toContain(`/* === /PP:BLOCK:${section.anchors.cssBlockId} === */`);
}

describe('Near-universal sections', () => {
  it('should validate about section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('about') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{heading}}');
    expect(html).toContain('{{body}}');
    expect(html).toContain('{{imageAlt}}');
    expect(html).toContain('{{layout}}');
  });

  it('should validate features-grid section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('features-grid') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{heading}}');
    expect(html).toContain('{{subheading}}');
    expect(html).toContain('{{#each items}}');
    expect(html).toContain('{{this.icon}}');
    expect(html).toContain('{{this.title}}');
    expect(html).toContain('{{this.description}}');
    expect(html).toContain('{{/each}}');
  });

  it('should validate testimonials section matches the reference example', () => {
    const library = new SectionLibrary();
    const section = library.getSection('testimonials') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('testimonials__grid');
    expect(html).toContain('testimonials__card');
    expect(html).toContain('testimonials__quote');
    expect(html).toContain('testimonials__author');
    expect(html).toContain('testimonials__rating');
    expect(html).toContain('{{heading}}');
    expect(html).toContain('{{subheading}}');
    expect(html).toContain('{{#each items}}');
    expect(html).toContain('{{this.quote}}');
    expect(html).toContain('{{this.name}}');
    expect(html).toContain('{{this.role}}');
    expect(html).toContain('{{this.rating}}');
    expect(html).toContain('{{{this.starsHtml}}}');
  });

  it('should validate cta-banner section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('cta-banner') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('cta-banner--{{style}}');
    expect(html).toContain('{{heading}}');
    expect(html).toContain('{{subheading}}');
    expect(html).toContain('{{ctaText}}');
    expect(html).toContain('{{ctaHref}}');
    expect(html).toContain('{{style}}');
  });
});
