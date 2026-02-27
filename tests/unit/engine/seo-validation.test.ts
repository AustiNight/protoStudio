import { describe, expect, it } from 'vitest';

import { validateSeoArtifacts } from '../../../src/engine/content/seo-validation';
import type { VirtualFile } from '../../../src/types/vfs';

function makeFile(path: string, content: string): VirtualFile {
  return {
    path,
    content,
    hash: 'hash',
    lastModified: 1,
  };
}

describe('seo-validation', () => {
  it('should fail when required SEO artifacts are missing', () => {
    const files = new Map<string, VirtualFile>();
    files.set(
      'index.html',
      makeFile('index.html', '<html><head><title>Test</title></head><body></body></html>'),
    );

    const result = validateSeoArtifacts({ files });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'sitemap.xml')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'robots.txt')).toBe(true);
    expect(
      result.issues.some((issue) => issue.message.includes('JSON-LD')),
    ).toBe(true);
  });

  it('should pass when required SEO artifacts are present', () => {
    const files = new Map<string, VirtualFile>();
    const html = [
      '<html>',
      '<head>',
      '<meta name="description" content="Test" />',
      '<meta property="og:title" content="Test" />',
      '<meta property="og:description" content="Test" />',
      '<meta property="og:image" content="https://images.unsplash.com/photo-1" />',
      '<script type="application/ld+json">{"@context":"https://schema.org"}</script>',
      '</head>',
      '<body></body>',
      '</html>',
    ].join('');

    files.set('index.html', makeFile('index.html', html));
    files.set('sitemap.xml', makeFile('sitemap.xml', '<urlset></urlset>'));
    files.set('robots.txt', makeFile('robots.txt', 'User-agent: *\nAllow: /'));

    const result = validateSeoArtifacts({ files });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
