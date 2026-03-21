import { describe, expect, it } from 'vitest';

import { buildPreviewHtml } from '../../../src/engine/vfs/preview';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { VfsMetadata } from '../../../src/types/vfs';

const metadata: VfsMetadata = {
  title: 'Preview Asset Test',
  description: 'Asset inlining coverage',
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
    '<!doctype html><html><head></head><body></body></html>',
  );
  return vfs;
}

describe('buildPreviewHtml image asset inlining', () => {
  it('inlines local svg assets in HTML image attributes', async () => {
    const vfs = await createVfs();
    await vfs.updateFile(
      'index.html',
      '<!doctype html><html><head></head><body><img src="assets/dog.svg" alt="dog"></body></html>',
    );
    await vfs.addFile(
      'assets/dog.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><circle cx="0.5" cy="0.5" r="0.5"/></svg>',
    );

    const preview = buildPreviewHtml(vfs);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    expect(preview.value.html).toContain('data:image/svg+xml;utf8,');
    expect(preview.value.html).not.toContain('assets/dog.svg');
  });

  it('inlines local raster assets from relative paths as data URIs', async () => {
    const vfs = await createVfs();
    await vfs.updateFile(
      'index.html',
      '<!doctype html><html><head></head><body><img src="./assets/palm.png" alt="palm"></body></html>',
    );
    await vfs.addFile(
      'assets/palm.png',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2l6X0AAAAASUVORK5CYII=',
    );

    const preview = buildPreviewHtml(vfs);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    expect(preview.value.html).toContain('data:image/png;base64,');
    expect(preview.value.html).toContain(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2l6X0AAAAASUVORK5CYII=',
    );
    expect(preview.value.html).not.toContain('./assets/palm.png');
  });
});
