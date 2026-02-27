import { describe, expect, it } from 'vitest';

import { ScaffoldAuditor } from '../../src/engine/builder/scaffold';
import { TemplateAssembler } from '../../src/engine/vfs/assembler';
import type { TemplateConfig } from '../../src/types/template';

import marketingConfig from '../../src/engine/templates/configs/marketing.json';
import portfolioConfig from '../../src/engine/templates/configs/portfolio.json';
import smallBusinessConfig from '../../src/engine/templates/configs/small-business.json';

function extractSections(html: string): string[] {
  const matches = html.matchAll(/<!--\s*PP:SECTION:([A-Za-z0-9_-]+)\s*-->/g);
  return Array.from(matches, (match) => match[1]);
}

describe('Template configs', () => {
  it('should assemble marketing template with scaffold score 100', async () => {
    const assembler = new TemplateAssembler();
    const config = marketingConfig as TemplateConfig;
    const validation = assembler.validateConfig(config);

    expect(validation.valid).toBe(true);

    const vfs = await assembler.assemble(config);
    const audit = new ScaffoldAuditor().audit(vfs);

    expect(audit.score).toBe(100);

    const html = vfs.getFile('index.html')?.content ?? '';
    expect(extractSections(html)).toEqual(config.pages['index.html'].sections);
  });

  it('should assemble portfolio template with scaffold score 100', async () => {
    const assembler = new TemplateAssembler();
    const config = portfolioConfig as TemplateConfig;
    const validation = assembler.validateConfig(config);

    expect(validation.valid).toBe(true);

    const vfs = await assembler.assemble(config);
    const audit = new ScaffoldAuditor().audit(vfs);

    expect(audit.score).toBe(100);

    const html = vfs.getFile('index.html')?.content ?? '';
    expect(extractSections(html)).toEqual(config.pages['index.html'].sections);
  });

  it('should assemble small-business template with scaffold score 100', async () => {
    const assembler = new TemplateAssembler();
    const config = smallBusinessConfig as TemplateConfig;
    const validation = assembler.validateConfig(config);

    expect(validation.valid).toBe(true);

    const vfs = await assembler.assemble(config);
    const audit = new ScaffoldAuditor().audit(vfs);

    expect(audit.score).toBe(100);

    const html = vfs.getFile('index.html')?.content ?? '';
    expect(extractSections(html)).toEqual(config.pages['index.html'].sections);
  });

});
