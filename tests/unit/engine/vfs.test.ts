import { describe, expect, it } from 'vitest';

import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { VfsMetadata } from '../../../src/types/vfs';

const baseMetadata: VfsMetadata = {
  title: 'Test Site',
  description: 'Testing VFS core',
  colors: {
    primary: '#111111',
    secondary: '#222222',
    accent: '#333333',
    bg: '#ffffff',
    text: '#000000',
  },
  fonts: {
    headingFont: 'Inter',
    bodyFont: 'Inter',
  },
};

function buildMetadata(): VfsMetadata {
  return {
    title: baseMetadata.title,
    description: baseMetadata.description,
    colors: { ...baseMetadata.colors },
    fonts: { ...baseMetadata.fonts },
  };
}

function createVfs(version = 1): VirtualFileSystem {
  return new VirtualFileSystem({ metadata: buildMetadata(), version });
}

const sampleHtml = `<!doctype html>
<html lang="en">
<head>
  <title>Test</title>
</head>
<body>
  <!-- PP:SECTION:hero -->
  <section class="hero" data-pp-section="hero"></section>
  <!-- /PP:SECTION:hero -->
</body>
</html>`;

describe('VirtualFileSystem', () => {
  it('should create a file and retrieve it by path when added', async () => {
    const vfs = createVfs();
    const created = await vfs.addFile('index.html', '<html></html>');

    const retrieved = vfs.getFile('index.html');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.content).toBe('<html></html>');
    expect(retrieved?.hash).toBe(created.hash);
  });

  it('should return null for nonexistent file path when requested', () => {
    const vfs = createVfs();
    expect(vfs.getFile('missing.txt')).toBeNull();
  });

  it('should update file content and increment hash when updated', async () => {
    const vfs = createVfs();
    await vfs.addFile('index.html', 'old content');
    const before = vfs.getFile('index.html');

    const updated = await vfs.updateFile('index.html', 'new content');
    expect(updated.content).toBe('new content');
    expect(updated.hash).not.toBe(before?.hash);
  });

  it('should delete a file and confirm it no longer exists when removed', async () => {
    const vfs = createVfs();
    await vfs.addFile('index.html', 'content');

    const deleted = vfs.deleteFile('index.html');
    expect(deleted).toBe(true);
    expect(vfs.hasFile('index.html')).toBe(false);
  });

  it('should list all file paths when multiple files are added', async () => {
    const vfs = createVfs();
    await vfs.addFile('b.txt', 'b');
    await vfs.addFile('a.txt', 'a');

    expect(vfs.listFiles()).toEqual(['a.txt', 'b.txt']);
  });

  it('should increment version on explicit call when requested', () => {
    const vfs = createVfs(2);
    expect(vfs.getVersion()).toBe(2);
    expect(vfs.incrementVersion()).toBe(3);
    expect(vfs.getVersion()).toBe(3);
  });

  it('should produce a deep clone with no shared references when cloned', async () => {
    const vfs = createVfs();
    await vfs.addFile('index.html', 'content');

    const clone = vfs.clone();
    expect(clone).not.toBe(vfs);
    expect(clone.files).not.toBe(vfs.files);
    expect(clone.metadata).not.toBe(vfs.metadata);
    expect(clone.metadata.colors).not.toBe(vfs.metadata.colors);
    expect(clone.metadata.fonts).not.toBe(vfs.metadata.fonts);

    const originalFile = vfs.files.get('index.html');
    const cloneFile = clone.files.get('index.html');
    expect(originalFile).toBeDefined();
    expect(cloneFile).toBeDefined();
    if (originalFile && cloneFile) {
      expect(cloneFile).not.toBe(originalFile);
    }
  });

  it('should not affect original when clone is modified', async () => {
    const vfs = createVfs();
    await vfs.addFile('index.html', 'original');

    const clone = vfs.clone();
    await clone.updateFile('index.html', 'changed');

    expect(vfs.getFile('index.html')?.content).toBe('original');
  });

  it('should generate a manifest with correct page list when html files are present', async () => {
    const vfs = createVfs();
    await vfs.addFile('index.html', sampleHtml);
    await vfs.addFile('about.html', sampleHtml);

    const manifest = vfs.toManifest();
    expect(manifest.pages.map((page) => page.path)).toEqual([
      'about.html',
      'index.html',
    ]);
    expect(manifest.theme.colors).toEqual(buildMetadata().colors);
    expect(manifest.theme.fonts).toEqual(buildMetadata().fonts);
  });

  it('should extract PP:SECTION anchor names from HTML when present', async () => {
    const vfs = createVfs();
    const html = `<!doctype html>
    <html lang="en">
    <body>
      <!-- PP:SECTION:hero -->
      <section data-pp-section="hero"></section>
      <!-- /PP:SECTION:hero -->
      <!-- PP:SECTION:features -->
      <section data-pp-section="features"></section>
      <!-- /PP:SECTION:features -->
    </body>
    </html>`;

    await vfs.addFile('index.html', html);
    const manifest = vfs.toManifest();
    const page = manifest.pages.find((entry) => entry.path === 'index.html');
    expect(page?.sections).toEqual(['hero', 'features']);
  });

  it('should extract PP:BLOCK anchor names from CSS when present', async () => {
    const vfs = createVfs();
    const css = `/* === PP:BLOCK:variables === */
    :root { --color-text: #111111; }
    /* === /PP:BLOCK:variables === */
    /* === PP:BLOCK:hero === */
    .hero { color: var(--color-text); }
    /* === /PP:BLOCK:hero === */`;

    await vfs.addFile('styles.css', css);
    const manifest = vfs.toManifest();
    expect(manifest.cssBlocks).toEqual(['variables', 'hero']);
  });

  it('should extract PP:FUNC anchor names from JS when present', async () => {
    const vfs = createVfs();
    const js = `// === PP:FUNC:init ===
    function init() {}
    // === /PP:FUNC:init ===
    // === PP:FUNC:bind ===
    function bind() {}
    // === /PP:FUNC:bind ===`;

    await vfs.addFile('main.js', js);
    const manifest = vfs.toManifest();
    expect(manifest.jsFunctions).toEqual(['init', 'bind']);
  });
});
