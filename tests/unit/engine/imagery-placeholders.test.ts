import { describe, expect, it, vi } from 'vitest';

import { resolveImageryPlaceholdersInVfs } from '../../../src/engine/imagery/placeholders';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { VfsMetadata } from '../../../src/types/vfs';

const metadata: VfsMetadata = {
  title: 'Imagery Placeholder Test',
  description: 'Placeholder resolver coverage',
  colors: {
    primary: '#111111',
    secondary: '#222222',
    accent: '#333333',
    bg: '#ffffff',
    text: '#000000',
  },
  fonts: {
    headingFont: 'Space Grotesk',
    bodyFont: 'Space Grotesk',
  },
};

async function createVfs(): Promise<VirtualFileSystem> {
  const vfs = new VirtualFileSystem({
    metadata,
    version: 1,
  });
  await vfs.addFile(
    'index.html',
    '<!doctype html><html><body><img src="pp://public-domain/doberman%20dog"><img src="pp://generate-image/neon%20palm%20tree"></body></html>',
  );
  await vfs.addFile(
    'styles.css',
    '.hero{background-image:url("pp://public-domain/tropical%20pattern")}',
  );
  return vfs;
}

describe('resolveImageryPlaceholdersInVfs', () => {
  it('resolves public-domain and generated placeholders across html/css files', async () => {
    const vfs = await createVfs();
    const resolvePublicDomain = vi
      .fn()
      .mockResolvedValueOnce('https://upload.wikimedia.org/doberman.jpg')
      .mockResolvedValueOnce('https://upload.wikimedia.org/pattern.png');
    const resolveGenerated = vi
      .fn()
      .mockResolvedValue('data:image/png;base64,generated-image-data');

    const result = await resolveImageryPlaceholdersInVfs(vfs, {
      resolvePublicDomain,
      resolveGenerated,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replacements).toBe(3);

    const html = vfs.getFile('index.html')?.content ?? '';
    const css = vfs.getFile('styles.css')?.content ?? '';
    expect(html).toContain('https://upload.wikimedia.org/doberman.jpg');
    expect(html).toContain('data:image/png;base64,generated-image-data');
    expect(css).toContain('https://upload.wikimedia.org/pattern.png');
  });

  it('returns retryable error when resolver throws', async () => {
    const vfs = await createVfs();
    const result = await resolveImageryPlaceholdersInVfs(vfs, {
      resolvePublicDomain: async () => {
        throw new Error('network down');
      },
      resolveGenerated: async () => 'data:image/png;base64,generated-image-data',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('retryable');
    expect(result.error.code).toBe('imagery_resolution_failed');
  });
});
