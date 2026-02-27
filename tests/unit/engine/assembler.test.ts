import { describe, expect, it } from 'vitest';

import { TemplateAssembler } from '../../../src/engine/vfs/assembler';
import type {
  SectionSlot,
  TemplateConfig,
  TemplateFeatureFlags,
  TemplateTheme,
} from '../../../src/types/template';

const BASE_FEATURES: TemplateFeatureFlags = {
  formToEmail: false,
  mapEmbed: false,
  lightbox: false,
  cart: false,
  calendarEmbed: false,
  blogEngine: false,
  multiStepForm: false,
};

const BASE_THEME: TemplateTheme = {
  primary: '#2563eb',
  secondary: '#1e40af',
  accent: '#f59e0b',
  bg: '#ffffff',
  text: '#0f172a',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

function buildConfig(sections: string[]): TemplateConfig {
  return {
    id: 'basic',
    label: 'Basic',
    description: 'Basic template',
    pages: {
      'index.html': {
        sections,
      },
    },
    features: BASE_FEATURES,
    defaultTheme: BASE_THEME,
  };
}

describe('TemplateAssembler', () => {
  it('should assemble a single-page site with 3 sections', async () => {
    const assembler = new TemplateAssembler();
    const config = buildConfig(['seo-base', 'nav', 'hero', 'footer']);

    const vfs = await assembler.assemble(config);
    const html = vfs.getFile('index.html')?.content ?? '';

    expect(html).toContain('PP:SECTION:nav');
    expect(html).toContain('PP:SECTION:hero');
    expect(html).toContain('PP:SECTION:footer');
    expect(vfs.getFile('styles.css')).not.toBeNull();
    expect(vfs.getFile('main.js')).not.toBeNull();
    expect(vfs.getVersion()).toBe(1);
  });

  it('should fill slots with customization values', () => {
    const assembler = new TemplateAssembler();
    const html = '<h1>{{heading}}</h1><p>{{subheading}}</p>';
    const slots: SectionSlot[] = [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Default heading',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Default subheading',
      },
    ];

    const output = assembler.fillSlots(
      html,
      {
        slotOverrides: {
          heading: 'Custom heading',
        },
      },
      slots,
    );

    expect(output).toContain('Custom heading');
  });

  it('should use default slot values when customization is empty', () => {
    const assembler = new TemplateAssembler();
    const html = '<h1>{{heading}}</h1><p>{{subheading}}</p>';
    const slots: SectionSlot[] = [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Default heading',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Default subheading',
      },
    ];

    const output = assembler.fillSlots(html, undefined, slots);

    expect(output).toContain('Default heading');
    expect(output).toContain('Default subheading');
  });

  it('should validate that all referenced sections exist in library', () => {
    const assembler = new TemplateAssembler();
    const config = buildConfig(['nav', 'missing-section', 'footer']);

    const result = assembler.validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('missing-section'))).toBe(true);
  });

  it('should reject config with conflicting sections', () => {
    const assembler = new TemplateAssembler();
    const config = buildConfig(['nav', 'contact', 'multi-step-form', 'footer']);

    const result = assembler.validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('conflicts'))).toBe(true);
  });
});
