import type {
  QuickCustomization,
  SectionSlot,
  TemplateConfig,
  TemplateTheme,
  ValidationIssue,
  ValidationResult,
} from '../../types/template';
import type { ColorPalette, FontSelection, VfsMetadata } from '../../types/vfs';

import { sectionLibrary, SectionLibrary } from '../templates/section-library';
import { VirtualFileSystem } from './vfs';

const SECTION_ASSET_ROOT = '../templates/sections/';

const SECTION_HTML = import.meta.glob<string>(
  '../templates/sections/**/*.html',
  {
    as: 'raw',
    eager: true,
  },
);
const SECTION_CSS = import.meta.glob<string>(
  '../templates/sections/**/*.css',
  {
    as: 'raw',
    eager: true,
  },
);
const SECTION_JS = import.meta.glob<string>(
  '../templates/sections/**/*.{ts,js}',
  {
    as: 'raw',
    eager: true,
  },
);

type SlotValue = string | string[];

interface RenderContext {
  slotValues: Map<string, SlotValue>;
  parentValues: Record<string, string>;
}

export class TemplateAssembler {
  private library: SectionLibrary;

  constructor(library: SectionLibrary = sectionLibrary) {
    this.library = library;
  }

  async assemble(
    config: TemplateConfig,
    customization?: QuickCustomization,
  ): Promise<VirtualFileSystem> {
    const theme = applyCustomizationToTheme(config.defaultTheme, customization);
    const metadata = buildMetadata(config, customization, theme);
    const vfs = new VirtualFileSystem({
      metadata,
      templateId: config.id,
      version: 1,
    });

    const usedSections: string[] = [];
    const usedSet = new Set<string>();

    for (const [pagePath, pageConfig] of Object.entries(config.pages)) {
      const headSections: string[] = [];
      const bodySections: string[] = [];

      for (const sectionId of pageConfig.sections) {
        const section = this.library.getSection(sectionId);
        if (!section) {
          continue;
        }

        if (!usedSet.has(sectionId)) {
          usedSet.add(sectionId);
          usedSections.push(sectionId);
        }

        const slotOverrides = buildSlotOverrides(sectionId, customization, metadata);
        const mergedCustomization = mergeCustomization(customization, slotOverrides);
        const sectionHtml = loadSectionHtml(section.files.html);
        const filled = this.fillSlots(sectionHtml, mergedCustomization, section.slots).trim();

        if (sectionId === 'seo-base') {
          headSections.push(filled);
          continue;
        }

        if (sectionId === 'footer') {
          bodySections.push('<!-- PP:INSERT_BEFORE:footer -->');
        }

        bodySections.push(filled);
      }

      const headMeta =
        headSections.length > 0
          ? headSections.join('\n')
          : buildDefaultHeadMeta(metadata);
      const pageHtml = buildHtmlShell(headMeta, bodySections.join('\n\n'));
      await vfs.addFile(pagePath, pageHtml);
    }

    const css = buildStylesheet(usedSections, this.library, theme);
    const js = buildJavascript(usedSections, this.library);

    await vfs.addFile('styles.css', css);
    await vfs.addFile('main.js', js);

    return vfs;
  }

  fillSlots(
    sectionHtml: string,
    customization: QuickCustomization | undefined,
    slots: SectionSlot[],
  ): string {
    const slotValues = buildSlotValues(slots, customization);
    const parentValues = buildParentValues(slotValues);

    let output = renderListLoops(sectionHtml, {
      slotValues,
      parentValues,
    });

    for (const [slotId, value] of slotValues) {
      const rendered =
        Array.isArray(value) ? renderInlineList(slotId, value) : value;
      output = replaceSlot(output, slotId, rendered);
    }

    return output;
  }

  validateConfig(config: TemplateConfig): ValidationResult {
    const issues: ValidationIssue[] = [];
    const referenced = new Set<string>();

    for (const [pagePath, pageConfig] of Object.entries(config.pages)) {
      const sections = pageConfig.sections;
      if (!Array.isArray(sections)) {
        issues.push({
          path: `pages.${pagePath}.sections`,
          message: 'Sections must be an array.',
        });
        continue;
      }

      sections.forEach((sectionId, index) => {
        referenced.add(sectionId);
        const section = this.library.getSection(sectionId);
        if (!section) {
          issues.push({
            path: `pages.${pagePath}.sections[${index}]`,
            message: `Unknown section "${sectionId}".`,
          });
        }
      });
    }

    for (const sectionId of referenced) {
      const section = this.library.getSection(sectionId);
      if (!section) {
        continue;
      }

      section.dependencies.forEach((dependency) => {
        if (!referenced.has(dependency)) {
          issues.push({
            path: `sections.${sectionId}.dependencies`,
            message: `Missing dependency "${dependency}" for section "${sectionId}".`,
          });
        }
      });

      section.conflicts.forEach((conflict) => {
        if (referenced.has(conflict)) {
          issues.push({
            path: `sections.${sectionId}.conflicts`,
            message: `Section "${sectionId}" conflicts with "${conflict}".`,
          });
        }
      });
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

function buildMetadata(
  config: TemplateConfig,
  customization: QuickCustomization | undefined,
  theme: TemplateTheme,
): VfsMetadata {
  return {
    title: customization?.title ?? config.label,
    description: customization?.slogan ?? config.description,
    colors: {
      primary: theme.primary,
      secondary: theme.secondary,
      accent: theme.accent,
      bg: theme.bg,
      text: theme.text,
    },
    fonts: {
      headingFont: theme.headingFont,
      bodyFont: theme.bodyFont,
    },
  };
}

function mergeCustomization(
  customization: QuickCustomization | undefined,
  slotOverrides: Record<string, string | string[]>,
): QuickCustomization {
  const base = customization ?? {};
  return {
    ...base,
    slotOverrides: {
      ...(base.slotOverrides ?? {}),
      ...slotOverrides,
    },
  };
}

function buildSlotOverrides(
  sectionId: string,
  customization: QuickCustomization | undefined,
  metadata: VfsMetadata,
): Record<string, string | string[]> {
  if (!customization) {
    return {};
  }

  const overrides: Record<string, string | string[]> = {};

  if (sectionId === 'hero') {
    if (customization.title) {
      overrides.heading = customization.title;
    }
    if (customization.slogan) {
      overrides.subheading = customization.slogan;
    }
  }

  if (sectionId === 'nav' && customization.title) {
    overrides.logoText = customization.title;
  }

  if (sectionId === 'seo-base') {
    overrides.title = customization.title ?? metadata.title;
    overrides.description = customization.slogan ?? metadata.description;
  }

  return overrides;
}

function buildSlotValues(
  slots: SectionSlot[],
  customization: QuickCustomization | undefined,
): Map<string, SlotValue> {
  const values = new Map<string, SlotValue>();

  for (const slot of slots) {
    const override = customization?.slotOverrides?.[slot.id];
    if (override !== undefined) {
      values.set(slot.id, override);
      continue;
    }

    const defaultValue = slot.defaultValue;
    if (defaultValue === undefined) {
      values.set(slot.id, '');
    } else if (Array.isArray(defaultValue)) {
      values.set(slot.id, [...defaultValue]);
    } else {
      values.set(slot.id, defaultValue);
    }
  }

  return values;
}

function buildParentValues(slotValues: Map<string, SlotValue>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [slotId, value] of slotValues) {
    record[slotId] = Array.isArray(value) ? value.join(', ') : value;
  }
  return record;
}

function renderListLoops(template: string, context: RenderContext): string {
  const loopRegex = /{{#each\s+([A-Za-z0-9_-]+)\s*}}([\s\S]*?){{\/each}}/g;

  return template.replace(loopRegex, (_, slotId: string, inner: string) => {
    const value = context.slotValues.get(slotId);
    if (!Array.isArray(value)) {
      return '';
    }

    const keys = extractItemKeys(inner);
    return value
      .map((item) =>
        renderListItem(inner, item, keys, context.parentValues),
      )
      .join('\n');
  });
}

function extractItemKeys(template: string): string[] {
  const keys: string[] = [];
  const regex = /{{{?\s*this\.([A-Za-z0-9_-]+)\s*}?}}/g;
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(template))) {
    const key = match[1];
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }

  return keys;
}

function renderListItem(
  template: string,
  raw: string,
  keys: string[],
  parentValues: Record<string, string>,
): string {
  const record = parseListRecord(raw, keys);
  let output = template;

  output = output.replace(/{{{?\s*this\s*}?}}/g, () => record.__self__ ?? raw);
  output = output.replace(
    /{{{?\s*this\.([A-Za-z0-9_-]+)\s*}?}}/g,
    (_, key: string) => record[key] ?? '',
  );
  output = output.replace(
    /{{{?\s*\.\.\/([A-Za-z0-9_-]+)\s*}?}}/g,
    (_, key: string) => parentValues[key] ?? '',
  );

  return output;
}

function parseListRecord(raw: string, keys: string[]): Record<string, string> {
  const trimmed = raw.trim();
  const record: Record<string, string> = {};

  if (keys.length === 0) {
    record.__self__ = trimmed;
    return record;
  }

  const parsedJson = parseJsonValue(trimmed);
  if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
    Object.entries(parsedJson).forEach(([key, value]) => {
      record[key] = String(value);
    });
    record.__self__ = trimmed;
    return applyDerivedFields(record, keys);
  }

  const segments = trimmed.includes('|')
    ? trimmed.split('|').map((part) => part.trim())
    : [trimmed];

  if (segments.length === 1 && isTestimonialShape(keys)) {
    const testimonial = parseTestimonial(segments[0]);
    Object.entries(testimonial).forEach(([key, value]) => {
      record[key] = value;
    });
    record.__self__ = trimmed;
    return applyDerivedFields(record, keys);
  }

  const lastIndex = Math.max(keys.length - 1, 0);
  keys.forEach((key, index) => {
    if (index === lastIndex) {
      record[key] = segments.slice(index).join(' | ');
    } else {
      record[key] = segments[index] ?? '';
    }
  });

  record.__self__ = trimmed;
  return applyDerivedFields(record, keys);
}

function applyDerivedFields(
  record: Record<string, string>,
  keys: string[],
): Record<string, string> {
  if (keys.includes('featuresHtml') && record.featuresHtml) {
    record.featuresHtml = renderFeaturesHtml(record.featuresHtml);
  }

  if (keys.includes('starsHtml')) {
    const rating = record.rating ?? '';
    record.starsHtml = renderStarsHtml(rating);
  }

  return record;
}

function parseJsonValue(value: string): unknown | null {
  if (!value.startsWith('{') && !value.startsWith('[')) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isTestimonialShape(keys: string[]): boolean {
  return (
    keys.includes('quote') &&
    keys.includes('name') &&
    keys.includes('rating')
  );
}

function parseTestimonial(raw: string): Record<string, string> {
  const match =
    /^["“]?(.+?)["”]?\s*-\s*([^,(]+)(?:,\s*([^()]+))?\s*\((\d(?:\.\d)?)(?:\/5)?\)/.exec(
      raw,
    );

  if (!match) {
    return {
      quote: raw,
      name: '',
      role: '',
      rating: '5',
    };
  }

  return {
    quote: match[1]?.trim() ?? raw,
    name: match[2]?.trim() ?? '',
    role: match[3]?.trim() ?? '',
    rating: match[4]?.trim() ?? '5',
  };
}

function renderFeaturesHtml(value: string): string {
  if (value.includes('<')) {
    return value;
  }
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => `<li>${item}</li>`)
    .join('');
  return `<ul>${items}</ul>`;
}

function renderStarsHtml(rawRating: string): string {
  const numeric = Number.parseFloat(rawRating);
  const rating = Number.isFinite(numeric) ? Math.round(numeric) : 5;
  const stars = Array.from({ length: Math.max(rating, 0) })
    .map(() => '★')
    .join('');
  return `<span class="rating">${stars}</span>`;
}

function replaceSlot(template: string, slotId: string, value: string): string {
  const triple = new RegExp(`{{{\\s*${escapeRegExp(slotId)}\\s*}}}`, 'g');
  const double = new RegExp(`{{\\s*${escapeRegExp(slotId)}\\s*}}`, 'g');
  return template.replace(triple, value).replace(double, value);
}

function renderInlineList(slotId: string, items: string[]): string {
  switch (slotId) {
    case 'links':
      return items
        .map(
          (item) =>
            `<li><a href="#${slugify(item)}">${item}</a></li>`,
        )
        .join('\n');
    case 'socialLinks':
      return items
        .map((item) => `<li><a href="#">${item}</a></li>`)
        .join('\n');
    case 'columns':
      return items
        .map(
          (item) =>
            `<div class="footer__column"><h4 class="footer__column-title">${item}</h4></div>`,
        )
        .join('\n');
    case 'fields':
      return items
        .map((item) => {
          const name = slugify(item);
          return `<label class="contact__label">${item}<input class="contact__input" name="${name}" placeholder="${item}" /></label>`;
        })
        .join('\n');
    default:
      return items.map((item) => `<span>${item}</span>`).join('\n');
  }
}

function buildHtmlShell(headMeta: string, bodyContent: string): string {
  const metaBlock = headMeta ? `${indentLines(headMeta, 2)}\n` : '';
  const bodyBlock = bodyContent ? indentLines(bodyContent, 2) : '';

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `${metaBlock}  <!-- PP:HEAD_META -->`,
    '  <link rel="stylesheet" href="styles.css" />',
    '  <!-- PP:HEAD_EXTRA -->',
    '</head>',
    '<body>',
    bodyBlock,
    '  <script src="main.js"></script>',
    '  <!-- PP:SCRIPTS_EXTRA -->',
    '</body>',
    '</html>',
  ].join('\n');
}

function buildDefaultHeadMeta(metadata: VfsMetadata): string {
  return [
    `<title>${metadata.title}</title>`,
    `<meta name="description" content="${metadata.description}" />`,
  ].join('\n');
}

function buildStylesheet(
  sectionIds: string[],
  library: SectionLibrary,
  theme: TemplateTheme,
): string {
  const base = buildBaseCss(theme);
  const blocks = sectionIds
    .map((sectionId) => {
      const section = library.getSection(sectionId);
      if (!section) {
        return '';
      }
      return loadSectionCss(section.files.css);
    })
    .filter((content) => content.length > 0)
    .join('\n\n');

  return [base, blocks, '/* PP:CSS_INSERT_POINT */']
    .filter((chunk) => chunk.length > 0)
    .join('\n\n');
}

function buildJavascript(sectionIds: string[], library: SectionLibrary): string {
  const modules = sectionIds
    .map((sectionId) => {
      const section = library.getSection(sectionId);
      if (!section?.files.js) {
        return '';
      }
      return loadSectionJs(section.files.js);
    })
    .filter((content) => content.length > 0)
    .join('\n\n');

  const mainBlock = [
    '// === PP:FUNC:main ===',
    "document.addEventListener('DOMContentLoaded', () => {",
    '  // PP:MAIN_CALLS',
    '});',
    '// === /PP:FUNC:main ===',
  ].join('\n');

  return [modules, mainBlock, '// PP:JS_INSERT_POINT']
    .filter((chunk) => chunk.length > 0)
    .join('\n\n');
}

function buildBaseCss(theme: TemplateTheme): string {
  const colors = normalizeColors(theme);
  const fonts = normalizeFonts(theme);
  const colorPrimaryStrong = mixColor(colors.primary, '#000000', 0.15);
  const colorPrimaryContrast = pickContrastColor(colors.primary);
  const colorAccentContrast = pickContrastColor(colors.accent);
  const colorBgAlt = mixColor(colors.bg, colors.text, 0.08);
  const colorSurface = mixColor(colors.bg, '#ffffff', 0.04);
  const colorBorder = mixColor(colors.text, colors.bg, 0.85);
  const colorTextMuted = mixColor(colors.text, colors.bg, 0.4);

  return [
    '/* === PP:BLOCK:variables === */',
    ':root {',
    `  --color-primary: ${colors.primary};`,
    `  --color-secondary: ${colors.secondary};`,
    `  --color-accent: ${colors.accent};`,
    `  --color-bg: ${colors.bg};`,
    `  --color-text: ${colors.text};`,
    `  --color-primary-strong: ${colorPrimaryStrong};`,
    `  --color-primary-contrast: ${colorPrimaryContrast};`,
    `  --color-accent-contrast: ${colorAccentContrast};`,
    `  --color-bg-alt: ${colorBgAlt};`,
    `  --color-surface: ${colorSurface};`,
    `  --color-border: ${colorBorder};`,
    `  --color-text-muted: ${colorTextMuted};`,
    `  --font-heading: ${fonts.headingFont};`,
    `  --font-body: ${fonts.bodyFont};`,
    '  --font-weight-semibold: 600;',
    '  --line-height-tight: 1.2;',
    '  --line-height-relaxed: 1.6;',
    '  --content-max: 72rem;',
    '  --content-narrow: 40rem;',
    '  --space-xs: 0.5rem;',
    '  --space-sm: 0.75rem;',
    '  --space-md: 1rem;',
    '  --space-lg: 2rem;',
    '  --space-section: clamp(2.5rem, 6vw, 5rem);',
    '  --radius-sm: 0.5rem;',
    '  --radius-md: 0.75rem;',
    '  --radius-lg: 1.5rem;',
    '  --radius-pill: 999px;',
    '  --shadow-lg: 0 24px 60px rgba(15, 23, 42, 0.12);',
    '  --border-width: 1px;',
    '}',
    '/* === /PP:BLOCK:variables === */',
    '',
    '/* === PP:BLOCK:reset === */',
    '*, *::before, *::after {',
    '  box-sizing: border-box;',
    '}',
    'body {',
    '  margin: 0;',
    '  font-family: var(--font-body);',
    '  background: var(--color-bg);',
    '  color: var(--color-text);',
    '  line-height: var(--line-height-relaxed);',
    '}',
    'img {',
    '  max-width: 100%;',
    '  display: block;',
    '}',
    'a {',
    '  color: inherit;',
    '}',
    '/* === /PP:BLOCK:reset === */',
    '',
    '/* === PP:BLOCK:base === */',
    'main {',
    '  display: block;',
    '}',
    'button, input, textarea, select {',
    '  font: inherit;',
    '}',
    '/* === /PP:BLOCK:base === */',
  ].join('\n');
}

function normalizeColors(theme: TemplateTheme): ColorPalette {
  return {
    primary: normalizeColor(theme.primary) ?? '#2563eb',
    secondary: normalizeColor(theme.secondary) ?? '#1e40af',
    accent: normalizeColor(theme.accent) ?? '#f59e0b',
    bg: normalizeColor(theme.bg) ?? '#ffffff',
    text: normalizeColor(theme.text) ?? '#0f172a',
  };
}

function normalizeFonts(theme: TemplateTheme): FontSelection {
  return {
    headingFont: normalizeFont(theme.headingFont),
    bodyFont: normalizeFont(theme.bodyFont),
  };
}

function normalizeFont(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes(' ') && !trimmed.startsWith('"') && !trimmed.startsWith("'")) {
    return `'${trimmed}'`;
  }
  return trimmed;
}

function applyCustomizationToTheme(
  theme: TemplateTheme,
  customization: QuickCustomization | undefined,
): TemplateTheme {
  const primaryOverride =
    customization?.primaryColor ?? customization?.colors?.primary;
  const primary = normalizeColor(primaryOverride ?? '') ?? theme.primary;

  return {
    primary,
    secondary: customization?.colors?.secondary ?? theme.secondary,
    accent: customization?.colors?.accent ?? theme.accent,
    bg: customization?.colors?.bg ?? theme.bg,
    text: customization?.colors?.text ?? theme.text,
    headingFont: theme.headingFont,
    bodyFont: theme.bodyFont,
  };
}

function normalizeColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed
      .slice(1)
      .split('')
      .map((channel) => channel + channel);
    return `#${r}${g}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

function mixColor(base: string, mix: string, weight: number): string {
  const baseRgb = parseHex(base);
  const mixRgb = parseHex(mix);
  if (!baseRgb || !mixRgb) {
    return base;
  }
  const w = clamp(weight, 0, 1);
  const r = Math.round(baseRgb.r * (1 - w) + mixRgb.r * w);
  const g = Math.round(baseRgb.g * (1 - w) + mixRgb.g * w);
  const b = Math.round(baseRgb.b * (1 - w) + mixRgb.b * w);
  return toHex({ r, g, b });
}

function pickContrastColor(color: string): string {
  const rgb = parseHex(color);
  if (!rgb) {
    return '#ffffff';
  }
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}

function parseHex(value: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeColor(value);
  if (!normalized) {
    return null;
  }
  const hex = normalized.slice(1);
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return { r, g, b };
}

function toHex(rgb: { r: number; g: number; b: number }): string {
  const toChannel = (channel: number) =>
    channel.toString(16).padStart(2, '0');
  return `#${toChannel(rgb.r)}${toChannel(rgb.g)}${toChannel(rgb.b)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadSectionHtml(relativePath: string): string {
  return loadAsset(SECTION_HTML, relativePath);
}

function loadSectionCss(relativePath: string): string {
  return loadAsset(SECTION_CSS, relativePath);
}

function loadSectionJs(relativePath: string): string {
  return loadAsset(SECTION_JS, relativePath);
}

function loadAsset(source: Record<string, string>, relativePath: string): string {
  const key = `${SECTION_ASSET_ROOT}${relativePath}`;
  const content = source[key];
  return typeof content === 'string' ? content : '';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function indentLines(value: string, spaces: number): string {
  const padding = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => (line.length > 0 ? `${padding}${line}` : line))
    .join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
