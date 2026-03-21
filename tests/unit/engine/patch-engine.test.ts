import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PatchEngine } from '../../../src/engine/builder/patch-engine';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { BuildPatch } from '../../../src/types/patch';
import type { VfsMetadata } from '../../../src/types/vfs';

interface ScaffoldFixture {
  metadata: VfsMetadata;
  version: number;
  templateId?: string;
  files: Array<{ path: string; content: string }>;
}

const engine = new PatchEngine();

function readFixture(relativePath: string): string {
  return readFileSync(new URL(`../../fixtures/${relativePath}`, import.meta.url), 'utf-8');
}

function readJsonFixture<T>(relativePath: string): T {
  return JSON.parse(readFixture(relativePath)) as T;
}

async function createVfsFromFixture(): Promise<VirtualFileSystem> {
  const fixture = readJsonFixture<ScaffoldFixture>('scaffolds/basic-scaffold.json');
  const vfs = new VirtualFileSystem({
    metadata: fixture.metadata,
    version: fixture.version,
    templateId: fixture.templateId,
  });

  for (const file of fixture.files) {
    await vfs.addFile(file.path, file.content);
  }

  return vfs;
}

describe('PatchEngine', () => {
  it('should apply a valid SectionReplace and preserve anchors when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/valid-section-replace.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const html = vfs.getFile('index.html')?.content ?? '';
    expect(html).toContain('Updated Hero');
    expect(html).toContain('<!-- PP:SECTION:hero -->');
    expect(html).toContain('<!-- /PP:SECTION:hero -->');
  });

  it('should apply a valid SectionInsert at the correct position when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/valid-section-insert.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const html = vfs.getFile('index.html')?.content ?? '';
    const insertIndex = html.indexOf('PP:SECTION:testimonials');
    const markerIndex = html.indexOf('<!-- PP:INSERT_BEFORE:footer -->');
    expect(insertIndex).toBeGreaterThan(-1);
    expect(markerIndex).toBeGreaterThan(insertIndex);
  });

  it('should apply a valid SectionDelete and remove anchors when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch: BuildPatch = {
      workItemId: 'WI-section-delete',
      targetVersion: 1,
      operations: [
        {
          op: 'section.delete',
          file: 'index.html',
          sectionId: 'hero',
          ifVersion: 1,
        },
      ],
    };

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const html = vfs.getFile('index.html')?.content ?? '';
    expect(html).not.toContain('PP:SECTION:hero');
  });

  it('should apply a valid CssAppend at the insert point when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/valid-css-append.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const css = vfs.getFile('styles.css')?.content ?? '';
    const appendIndex = css.indexOf('PP:BLOCK:testimonials');
    const markerIndex = css.indexOf('/* PP:CSS_INSERT_POINT */');
    expect(appendIndex).toBeGreaterThan(-1);
    expect(markerIndex).toBeGreaterThan(appendIndex);
  });

  it('should apply a valid CssReplaceBlock and preserve anchors when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/valid-css-replace-block.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const css = vfs.getFile('styles.css')?.content ?? '';
    expect(css).toContain('padding: 72px');
    expect(css).toContain('PP:BLOCK:hero');
  });

  it('should apply a valid JsAppend at the insert point when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/valid-js-append.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const js = vfs.getFile('main.js')?.content ?? '';
    const appendIndex = js.indexOf('PP:FUNC:hero-init');
    const markerIndex = js.indexOf('PP:JS_INSERT_POINT');
    expect(appendIndex).toBeGreaterThan(-1);
    expect(markerIndex).toBeGreaterThan(appendIndex);
  });

  it('should apply a valid JsReplaceFunction and preserve anchors when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch: BuildPatch = {
      workItemId: 'WI-js-replace',
      targetVersion: 1,
      operations: [
        {
          op: 'js.replace',
          file: 'main.js',
          funcId: 'init',
          js: '// === PP:FUNC:init ===\nfunction init() {\n  console.log(\'updated\');\n}\n// === /PP:FUNC:init ===',
          ifVersion: 1,
        },
      ],
    };

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const js = vfs.getFile('main.js')?.content ?? '';
    expect(js).toContain('updated');
    expect(js).toContain('PP:FUNC:init');
  });

  it('should apply a valid FileCreate when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/valid-file-create.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    expect(vfs.hasFile('pages/about.html')).toBe(true);
  });

  it('should apply a valid FileDelete when requested', async () => {
    const vfs = await createVfsFromFixture();
    await vfs.addFile('pages/old.html', '<html>Old</html>');

    const patch: BuildPatch = {
      workItemId: 'WI-file-delete',
      targetVersion: 1,
      operations: [
        {
          op: 'file.delete',
          file: 'pages/old.html',
          ifVersion: 1,
        },
      ],
    };

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    expect(vfs.hasFile('pages/old.html')).toBe(false);
  });

  it('should apply a valid MetadataUpdate when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/valid-metadata-update.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    expect(vfs.metadata.title).toBe('Updated Title');
    expect(vfs.metadata.colors.primary).toBe('#0a0a0a');
    expect(vfs.metadata.colors.accent).toBe('#ff0000');
  });

  it('should reject a patch with the wrong targetVersion when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/invalid-version-mismatch.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(false);
    expect(vfs.getVersion()).toBe(1);
  });

  it('should reject a patch targeting a nonexistent section when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/invalid-wrong-section.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(false);
  });

  it('should reject a patch with an unknown operation type when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-unknown-op',
      targetVersion: 1,
      operations: [
        {
          op: 'unknown.op',
          file: 'index.html',
          ifVersion: 1,
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown patch operation');
  });

  it('should atomically rollback on mid-patch failure when requested', async () => {
    const vfs = await createVfsFromFixture();
    const originalHtml = vfs.getFile('index.html')?.content ?? '';
    const patch: BuildPatch = {
      workItemId: 'WI-atomic',
      targetVersion: 1,
      operations: [
        {
          op: 'section.replace',
          file: 'index.html',
          sectionId: 'hero',
          html: '<section class="hero" data-pp-section="hero">New</section>',
          ifVersion: 1,
        },
        {
          op: 'section.delete',
          file: 'index.html',
          sectionId: 'missing',
          ifVersion: 1,
        },
      ],
    };

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(false);
    const currentHtml = vfs.getFile('index.html')?.content ?? '';
    expect(currentHtml).toBe(originalHtml);
  });

  it('should increment VFS version on successful apply when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/valid-section-replace.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    expect(vfs.getVersion()).toBe(2);
  });

  it('should reject a patch with a wrong schema when requested', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/invalid-wrong-schema.json');

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(false);
  });

  it('should reject malformed JSON fixtures when requested', () => {
    const raw = readFixture('patches/invalid-malformed-json.txt');
    expect(() => JSON.parse(raw)).toThrow();
  });

  it('should infer file path and ifVersion for section operations when omitted', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-missing-file-defaults',
      targetVersion: 1,
      operations: [
        {
          op: 'section.replace',
          sectionId: 'hero',
          html: '<section class="hero"><h1>Fallback Applied</h1></section>',
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const html = vfs.getFile('index.html')?.content ?? '';
    expect(html).toContain('Fallback Applied');
  });

  it('should normalize aliased section fields from model output', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-alias-fields',
      targetVersion: 1,
      operations: [
        {
          op: 'section.replace',
          section: 'hero',
          content: '<section class="hero"><h1>Alias Applied</h1></section>',
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const html = vfs.getFile('index.html')?.content ?? '';
    expect(html).toContain('Alias Applied');
  });

  it('should infer a section id from scaffold anchors when missing', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-infer-section-id',
      targetVersion: 1,
      operations: [
        {
          op: 'section.delete',
          file: 'index.html',
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
  });

  it('should infer insert marker and wrap section anchors for insert ops', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-infer-insert-marker',
      targetVersion: 1,
      operations: [
        {
          op: 'section.insert',
          sectionId: 'auto-inserted',
          html: '<section data-pp-section="auto-inserted"><h2>Auto Inserted</h2></section>',
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const html = vfs.getFile('index.html')?.content ?? '';
    expect(html).toContain('PP:SECTION:auto-inserted');
    expect(html).toContain('Auto Inserted');
  });

  it('should synthesize fallback html for replace ops missing html payload', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-replace-missing-html',
      targetVersion: 1,
      operations: [
        {
          op: 'section.replace',
          sectionId: 'hero',
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const html = vfs.getFile('index.html')?.content ?? '';
    expect(html).toContain('PP:SECTION:hero');
  });

  it('should strip duplicate section anchors from section.replace payloads', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-replace-strip-anchors',
      targetVersion: 1,
      operations: [
        {
          op: 'section.replace',
          file: 'index.html',
          sectionId: 'hero',
          html: '<!-- PP:SECTION:hero --><section class="hero"><h1>Anchored Replace</h1></section><!-- /PP:SECTION:hero -->',
          ifVersion: 1,
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const html = vfs.getFile('index.html')?.content ?? '';
    const anchorMatches = html.match(/<!--\s*PP:SECTION:hero\s*-->/g) ?? [];
    expect(anchorMatches.length).toBe(1);
    expect(html).toContain('Anchored Replace');
  });

  it('should normalize legacy asset.create alias into file.create', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-asset-create-alias',
      targetVersion: 1,
      operations: [
        {
          op: 'asset.create',
          path: 'robots.txt',
          content: 'User-agent: *\nAllow: /\n',
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    expect(vfs.hasFile('robots.txt')).toBe(true);
    expect(vfs.getFile('robots.txt')?.content).toContain('User-agent: *');
  });

  it('should normalize css.append content by wrapping missing PP:BLOCK anchors', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-css-append-wrap',
      targetVersion: 1,
      operations: [
        {
          op: 'css.append',
          file: 'styles.css',
          blockId: 'perf-tuning',
          css: '.perf-tuning{contain:layout paint;}',
          ifVersion: 99,
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const css = vfs.getFile('styles.css')?.content ?? '';
    expect(css).toContain('PP:BLOCK:perf-tuning');
    expect(css).toContain('contain:layout paint;');
  });

  it('should normalize js.append content by wrapping missing PP:FUNC anchors', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-js-append-wrap',
      targetVersion: 1,
      operations: [
        {
          op: 'js.append',
          file: 'main.js',
          funcId: 'perf-init',
          js: 'function perfInit(){return true;}',
          ifVersion: 42,
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const js = vfs.getFile('main.js')?.content ?? '';
    expect(js).toContain('PP:FUNC:perf-init');
    expect(js).toContain('function perfInit(){return true;}');
  });

  it('should remap missing css file path to canonical stylesheet for css.append', async () => {
    const vfs = await createVfsFromFixture();
    const patch = {
      workItemId: 'WI-css-remap-missing-path',
      targetVersion: 1,
      operations: [
        {
          op: 'css.append',
          file: 'src/styles/navigation.css',
          blockId: 'header-branding-nav-colors',
          css: '.nav{color:#111;}',
          ifVersion: 1,
        },
      ],
    } as unknown as BuildPatch;

    const result = await engine.apply(vfs, patch);

    expect(result.success).toBe(true);
    const css = vfs.getFile('styles.css')?.content ?? '';
    expect(css).toContain('PP:BLOCK:header-branding-nav-colors');
    expect(css).toContain('.nav{color:#111;}');
  });
});
