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

function expectJsAnchor(js: string, funcId: string): void {
  expect(js).toContain(`// === PP:FUNC:${funcId} ===`);
  expect(js).toContain(`// === /PP:FUNC:${funcId} ===`);
}

describe('Shared sections', () => {
  it('should validate faq section anchors, slots, and JS module', () => {
    const library = new SectionLibrary();
    const section = library.getSection('faq') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);
    const js = readSectionAsset(section.files.js as string);

    expectAnchors(section, html, css);
    expect(html).toContain('{{#each items}}');
    expect(html).toContain('{{this.question}}');
    expect(html).toContain('{{this.answer}}');
    expectJsAnchor(js, 'faq-init');
  });

  it('should validate pricing-table section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('pricing-table') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{#each plans}}');
    expect(html).toContain('{{this.name}}');
    expect(html).toContain('{{this.price}}');
    expect(html).toContain('{{this.summary}}');
    expect(html).toContain('{{{this.featuresHtml}}}');
    expect(html).toContain('ctaText');
  });

  it('should validate filterable-grid section anchors and JS module', () => {
    const library = new SectionLibrary();
    const section = library.getSection('filterable-grid') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);
    const js = readSectionAsset(section.files.js as string);

    expectAnchors(section, html, css);
    expect(html).toContain('data-filter-grid');
    expect(html).toContain('data-filter-item');
    expect(html).toContain('{{#each items}}');
    expect(html).toContain('{{this.category}}');
    expect(html).toContain('{{this.title}}');
    expect(html).toContain('{{this.summary}}');
    expect(html).toContain('linkText');
    expectJsAnchor(js, 'filterable-grid-init');
  });

  it('should validate lightbox section anchors, dependencies, and JS module', () => {
    const library = new SectionLibrary();
    const section = library.getSection('lightbox') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);
    const js = readSectionAsset(section.files.js as string);

    expectAnchors(section, html, css);
    expect(section.dependencies).toContain('gallery');
    expect(section.dependencies).toContain('product-cards');
    expect(html).toContain('data-lightbox-overlay');
    expect(html).toContain('data-lightbox-item');
    expect(html).toContain('{{this.src}}');
    expect(html).toContain('{{this.alt}}');
    expect(html).toContain('{{this.caption}}');
    expectJsAnchor(js, 'lightbox-init');
  });

  it('should validate category-filter section anchors, dependencies, and JS module', () => {
    const library = new SectionLibrary();
    const section = library.getSection('category-filter') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);
    const js = readSectionAsset(section.files.js as string);

    expectAnchors(section, html, css);
    expect(section.dependencies).toContain('filterable-grid');
    expect(html).toContain('data-filter-controls');
    expect(html).toContain('{{#each categories}}');
    expect(html).toContain('{{this.label}}');
    expect(html).toContain('{{this.value}}');
    expectJsAnchor(js, 'category-filter-init');
  });

  it('should validate services-list section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('services-list') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{#each services}}');
    expect(html).toContain('{{this.title}}');
    expect(html).toContain('{{this.description}}');
    expect(html).toContain('{{this.price}}');
  });

  it('should validate team section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('team') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{#each members}}');
    expect(html).toContain('{{this.name}}');
    expect(html).toContain('{{this.role}}');
    expect(html).toContain('{{this.bio}}');
    expect(html).toContain('{{this.image}}');
  });

  it('should validate hours-location section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('hours-location') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{#each hours}}');
    expect(html).toContain('{{this.day}}');
    expect(html).toContain('{{this.time}}');
    expect(html).toContain('{{address}}');
    expect(html).toContain('{{phone}}');
    expect(html).toContain('{{email}}');
    expect(html).toContain('{{mapLink}}');
  });

  it('should validate reviews-embed section anchors, dependencies, and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('reviews-embed') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(section.dependencies).toContain('testimonials');
    expect(html).toContain('{{{embedCode}}}');
    expect(html).toContain('{{#each reviews}}');
    expect(html).toContain('{{this.quote}}');
    expect(html).toContain('{{this.name}}');
    expect(html).toContain('{{this.source}}');
    expect(html).toContain('{{this.rating}}');
    expect(html).toContain('{{{this.starsHtml}}}');
  });
});
