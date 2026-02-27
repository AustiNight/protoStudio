import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SectionLibrary } from '../../../src/engine/templates/section-library';
import { generateRssXml } from '../../../src/engine/templates/sections/rss/rss';
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

describe('Specialist sections', () => {
  it('should validate blog-listing section anchors and JS module', () => {
    const library = new SectionLibrary();
    const section = library.getSection('blog-listing') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);
    const js = readSectionAsset(section.files.js as string);

    expectAnchors(section, html, css);
    expect(html).toContain('data-blog-posts');
    expect(html).toContain('data-blog-list');
    expectJsAnchor(js, 'blog-listing-init');
  });

  it('should validate blog-detail section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('blog-detail') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{{contentHtml}}}');
    expect(html).toContain('{{title}}');
    expect(html).toContain('{{heroImage}}');
    expect(html).toContain('{{#each tags}}');
  });

  it('should validate rss module generates valid XML structure', () => {
    const xml = generateRssXml(
      {
        title: 'Studio Journal',
        link: 'https://example.com',
        description: 'Latest stories from the studio.',
      },
      [
        {
          title: 'Designing for momentum',
          link: 'https://example.com/blog/designing-for-momentum',
          description: 'Launch strategy.',
          date: '2026-02-01',
        },
      ],
    );

    expect(xml).toContain('<?xml');
    expect(xml).toContain('<rss');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('<item>');
    expect(xml).toContain('<title>Designing for momentum</title>');
    expect(xml).toContain('</rss>');
  });

  it('should validate feature-comparison section anchors', () => {
    const library = new SectionLibrary();
    const section = library.getSection('feature-comparison') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{#each plans}}');
    expect(html).toContain('{{#each rows}}');
  });

  it('should validate project-gallery section anchors', () => {
    const library = new SectionLibrary();
    const section = library.getSection('project-gallery') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('data-filter-item');
    expect(html).toContain('data-lightbox-item');
    expect(html).toContain('{{this.src}}');
  });

  it('should validate product-cards section anchors', () => {
    const library = new SectionLibrary();
    const section = library.getSection('product-cards') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('data-cart-add');
    expect(html).toContain('{{this.price}}');
    expect(html).toContain('{{this.numericPrice}}');
  });

  it('should validate cart section anchors and JS module', () => {
    const library = new SectionLibrary();
    const section = library.getSection('cart') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);
    const js = readSectionAsset(section.files.js as string);

    expectAnchors(section, html, css);
    expect(html).toContain('data-cart-toggle');
    expect(html).toContain('data-cart-items');
    expectJsAnchor(js, 'cart-init');
  });

  it('should validate cart requires product-cards dependency', () => {
    const library = new SectionLibrary();
    const section = library.getSection('cart') as SectionDefinition;

    expect(section.dependencies).toContain('product-cards');
  });

  it('should validate stripe-checkout section anchors', () => {
    const library = new SectionLibrary();
    const section = library.getSection('stripe-checkout') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{stripePaymentLink}}');
  });

  it('should validate calendar-embed section anchors and slot', () => {
    const library = new SectionLibrary();
    const section = library.getSection('calendar-embed') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{calendarUrl}}');
  });

  it('should validate multi-step-form section anchors and JS module', () => {
    const library = new SectionLibrary();
    const section = library.getSection('multi-step-form') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);
    const js = readSectionAsset(section.files.js as string);

    expectAnchors(section, html, css);
    expect(html).toContain('data-form-step');
    expect(html).toContain('data-step-next');
    expectJsAnchor(js, 'multi-step-form-init');
  });

  it('should validate multi-step-form conflicts with contact section', () => {
    const library = new SectionLibrary();
    const section = library.getSection('multi-step-form') as SectionDefinition;

    expect(section.conflicts).toContain('contact');
  });

  it('should validate service-menu section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('service-menu') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{#each services}}');
    expect(html).toContain('{{this.name}}');
    expect(html).toContain('{{this.price}}');
  });

  it('should validate form-confirmation section anchors and slots', () => {
    const library = new SectionLibrary();
    const section = library.getSection('form-confirmation') as SectionDefinition;
    const html = readSectionAsset(section.files.html);
    const css = readSectionAsset(section.files.css);

    expectAnchors(section, html, css);
    expect(html).toContain('{{heading}}');
    expect(html).toContain('{{message}}');
    expect(html).toContain('{{ctaHref}}');
  });
});
