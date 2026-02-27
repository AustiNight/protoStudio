import { describe, expect, it } from 'vitest';

import { ScaffoldAuditor } from '../../src/engine/builder/scaffold';
import { TemplateAssembler } from '../../src/engine/vfs/assembler';
import type {
  TemplateConfig,
  TemplateFeatureFlags,
  TemplateTheme,
} from '../../src/types/template';

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

const MARKETING_CONFIG: TemplateConfig = {
  id: 'marketing',
  label: 'Marketing',
  description: 'High-converting SaaS landing pages.',
  pages: {
    'index.html': {
      sections: [
        'seo-base',
        'nav',
        'hero',
        'features-grid',
        'testimonials',
        'cta-banner',
        'footer',
      ],
    },
  },
  features: BASE_FEATURES,
  defaultTheme: BASE_THEME,
};

describe('Template assembly', () => {
  it('should assemble marketing template into valid VFS with correct anchor structure', async () => {
    const assembler = new TemplateAssembler();
    const vfs = await assembler.assemble(MARKETING_CONFIG);
    const audit = new ScaffoldAuditor().audit(vfs);

    expect(audit.score).toBe(100);
    expect(audit.issues.length).toBe(0);
  });
});
