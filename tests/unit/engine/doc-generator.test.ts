import { describe, expect, it } from 'vitest';

import { generateDocumentationPacket } from '../../../src/engine/deploy/doc-generator';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { VfsMetadata } from '../../../src/types/vfs';

async function buildVfs(): Promise<VirtualFileSystem> {
  const metadata: VfsMetadata = {
    title: 'Acme Studio',
    description: 'A modern creative studio website.',
    colors: {
      primary: '#1f2937',
      secondary: '#4b5563',
      accent: '#f97316',
      bg: '#ffffff',
      text: '#111827',
    },
    fonts: {
      headingFont: 'Fraunces',
      bodyFont: 'Inter',
    },
  };

  const vfs = new VirtualFileSystem({ metadata, templateId: 'marketing' });

  await vfs.addFile(
    'index.html',
    [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<link rel="stylesheet" href="styles.css" />',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600" />',
      '</head>',
      '<body>',
      '<!-- PP:SECTION:nav -->',
      '<!-- /PP:SECTION:nav -->',
      '<!-- PP:SECTION:hero -->',
      '<!-- /PP:SECTION:hero -->',
      '<img src="https://images.unsplash.com/photo-123" />',
      '<script src="main.js"></script>',
      '</body>',
      '</html>',
    ].join('\n'),
  );

  await vfs.addFile(
    'about.html',
    [
      '<!doctype html>',
      '<html>',
      '<body>',
      '<!-- PP:SECTION:about -->',
      '<!-- /PP:SECTION:about -->',
      '</body>',
      '</html>',
    ].join('\n'),
  );

  await vfs.addFile(
    'styles.css',
    ':root { --color-primary: #1f2937; }',
  );
  await vfs.addFile('main.js', "console.log('ok');");

  return vfs;
}

describe('documentation packet generator', () => {
  it('should generate all required section files', async () => {
    const vfs = await buildVfs();
    const packet = await generateDocumentationPacket({ vfs });
    const paths = packet.files.map((file) => file.path);

    expect(paths).toContain('README.md');
    expect(paths).toContain('01-site-overview.md');
    expect(paths).toContain('02-pages-and-components.md');
    expect(paths).toContain('03-dependencies.md');
    expect(paths).toContain('04-custom-domain-setup.md');
    expect(paths).toContain('05-service-configuration.md');
    expect(paths).toContain('06-maintenance-guide.md');
    expect(paths).toContain('07-cost-summary.md');
    expect(paths).toContain('prontoproto-attribution.md');
  });

  it('should apply site branding to the packet', async () => {
    const vfs = await buildVfs();
    const packet = await generateDocumentationPacket({ vfs });
    const readme = packet.files.find((file) => file.path === 'README.md');
    const logo = packet.assets.find(
      (asset) => asset.path === 'assets/logo.svg',
    );

    expect(readme?.content).toContain('Acme Studio');
    expect(readme?.content).toContain('#1f2937');
    expect(readme?.content).toContain('Fraunces');
    expect(logo?.content).toContain('Acme Studio');
    expect(logo?.content).toContain('#1f2937');
  });

  it('should output markdown with valid internal links', async () => {
    const vfs = await buildVfs();
    const packet = await generateDocumentationPacket({ vfs });
    const readme = packet.files.find((file) => file.path === 'README.md');
    const filePaths = new Set(packet.files.map((file) => file.path));
    const assetPaths = new Set(packet.assets.map((asset) => asset.path));

    expect(readme).toBeDefined();
    for (const file of packet.files) {
      expect(file.content.trim().startsWith('#')).toBe(true);
    }

    const links = extractMarkdownLinks(readme?.content ?? '');
    for (const link of links) {
      if (link.endsWith('.md')) {
        expect(filePaths.has(link)).toBe(true);
      } else if (link.startsWith('assets/')) {
        expect(assetPaths.has(link)).toBe(true);
      }
    }

    expect(assetPaths.has('assets/screenshot-index.png')).toBe(true);
    expect(assetPaths.has('assets/screenshot-about.png')).toBe(true);
  });
});

function extractMarkdownLinks(markdown: string): string[] {
  const links: string[] = [];
  const regex = /\[[^\]]*]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    links.push(match[1]);
  }
  return links;
}
