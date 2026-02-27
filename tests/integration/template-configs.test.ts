import { describe, expect, it } from 'vitest';

import { ScaffoldAuditor } from '../../src/engine/builder/scaffold';
import { TemplateAssembler } from '../../src/engine/vfs/assembler';
import type { TemplateConfig } from '../../src/types/template';

import marketingConfig from '../../src/engine/templates/configs/marketing.json';
import portfolioConfig from '../../src/engine/templates/configs/portfolio.json';
import smallBusinessConfig from '../../src/engine/templates/configs/small-business.json';
import blogConfig from '../../src/engine/templates/configs/blog.json';
import saasLandingConfig from '../../src/engine/templates/configs/saas-landing.json';
import simpleStoreConfig from '../../src/engine/templates/configs/simple-store.json';
import bookingsConfig from '../../src/engine/templates/configs/bookings.json';
import formToEmailConfig from '../../src/engine/templates/configs/form-to-email.json';

function extractSections(html: string): string[] {
  const matches = html.matchAll(/<!--\s*PP:SECTION:([A-Za-z0-9_-]+)\s*-->/g);
  return Array.from(matches, (match) => match[1]);
}

async function expectTemplateScaffold(config: TemplateConfig): Promise<void> {
  const assembler = new TemplateAssembler();
  const validation = assembler.validateConfig(config);

  expect(validation.valid).toBe(true);

  const vfs = await assembler.assemble(config);
  const audit = new ScaffoldAuditor().audit(vfs);

  expect(audit.score).toBe(100);

  for (const [pagePath, pageConfig] of Object.entries(config.pages)) {
    const page = vfs.getFile(pagePath);

    expect(page).not.toBeNull();

    const html = page?.content ?? '';
    expect(extractSections(html)).toEqual(pageConfig.sections);
  }
}

describe('Template configs', () => {
  it('should assemble marketing template with scaffold score 100', async () => {
    const config = marketingConfig as TemplateConfig;
    await expectTemplateScaffold(config);
  });

  it('should assemble portfolio template with scaffold score 100', async () => {
    const config = portfolioConfig as TemplateConfig;
    await expectTemplateScaffold(config);
  });

  it('should assemble small-business template with scaffold score 100', async () => {
    const config = smallBusinessConfig as TemplateConfig;
    await expectTemplateScaffold(config);
  });

  it('should assemble blog template with scaffold score 100', async () => {
    const config = blogConfig as TemplateConfig;
    await expectTemplateScaffold(config);
  });

  it('should assemble saas-landing template with scaffold score 100', async () => {
    const config = saasLandingConfig as TemplateConfig;
    await expectTemplateScaffold(config);
  });

  it('should assemble simple-store template with scaffold score 100', async () => {
    const config = simpleStoreConfig as TemplateConfig;
    await expectTemplateScaffold(config);
  });

  it('should assemble bookings template with scaffold score 100', async () => {
    const config = bookingsConfig as TemplateConfig;
    await expectTemplateScaffold(config);
  });

  it('should assemble form-to-email template with scaffold score 100', async () => {
    const config = formToEmailConfig as TemplateConfig;
    await expectTemplateScaffold(config);
  });

});
