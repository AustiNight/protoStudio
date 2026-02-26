import { describe, expect, it } from 'vitest';

import { validateContinuity } from '../../../src/engine/builder/continuity';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { WorkItem } from '../../../src/types/backlog';
import type { VfsMetadata } from '../../../src/types/vfs';

const baseHtml = `<!doctype html>
<html lang="en">
<head>
  <title>Test</title>
</head>
<body>
  <!-- PP:SECTION:nav -->
  <nav class="nav" data-pp-section="nav">
    <a href="#home">Home</a>
  </nav>
  <!-- /PP:SECTION:nav -->
  <!-- PP:SECTION:hero -->
  <section class="hero" data-pp-section="hero">
    <h1>Hero Headline</h1>
  </section>
  <!-- /PP:SECTION:hero -->
</body>
</html>`;

const baseCss = `/* === PP:BLOCK:variables === */
:root {
  --color-text: #111111;
  --color-bg: #ffffff;
}
/* === /PP:BLOCK:variables === */

/* === PP:BLOCK:hero === */
.hero {
  color: var(--color-text);
  background: var(--color-bg);
}
/* === /PP:BLOCK:hero === */`;

const baseMetadata: VfsMetadata = {
  title: 'Test Site',
  description: 'Testing continuity',
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

async function buildBaseVfs(): Promise<VirtualFileSystem> {
  const vfs = new VirtualFileSystem({ metadata: buildMetadata() });
  await vfs.addFile('index.html', baseHtml);
  await vfs.addFile('styles.css', baseCss);
  return vfs;
}

function buildMetadata(): VfsMetadata {
  return {
    title: baseMetadata.title,
    description: baseMetadata.description,
    colors: { ...baseMetadata.colors },
    fonts: { ...baseMetadata.fonts },
  };
}

function buildAtom(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'atom-1',
    sessionId: 'session-1',
    title: 'Update hero copy',
    description: 'Change hero headline text',
    effort: 'S',
    status: 'in_progress',
    order: 0,
    dependencies: [],
    rationale: 'User requested copy change',
    createdAt: 1,
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 12,
    visibleChange: 'Hero headline updated',
    ...overrides,
  };
}

describe('continuity checks', () => {
  it('should pass all checks when patch is well-behaved', async () => {
    const before = await buildBaseVfs();
    const after = before.clone();
    await after.updateFile(
      'index.html',
      baseHtml.replace('Hero Headline', 'New Hero Headline'),
    );

    const result = validateContinuity(before, after, buildAtom());
    expect(result.pass).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should fail scaffoldIntact when a section anchor is missing', async () => {
    const before = await buildBaseVfs();
    const after = before.clone();
    await after.updateFile(
      'index.html',
      baseHtml.replace(/<!-- PP:SECTION:hero -->[\s\S]*?<!-- \/PP:SECTION:hero -->/, ''),
    );

    const result = validateContinuity(before, after, buildAtom());
    expect(result.pass).toBe(false);
    expect(result.violations.some((v) => v.startsWith('scaffold_intact'))).toBe(true);
  });

  it("should pass themeConsistent when atom type is 'style' and :root changes", async () => {
    const before = await buildBaseVfs();
    const after = before.clone();
    await after.updateFile(
      'styles.css',
      baseCss.replace('--color-text: #111111;', '--color-text: #222222;'),
    );

    const result = validateContinuity(
      before,
      after,
      buildAtom({
        atomType: 'style',
        filesTouch: ['styles.css'],
      }),
    );

    expect(result.pass).toBe(true);
  });

  it('should fail themeConsistent when non-style atom changes :root', async () => {
    const before = await buildBaseVfs();
    const after = before.clone();
    await after.updateFile(
      'styles.css',
      baseCss.replace('--color-text: #111111;', '--color-text: #222222;'),
    );

    const result = validateContinuity(
      before,
      after,
      buildAtom({
        atomType: 'content',
        filesTouch: ['styles.css'],
      }),
    );

    expect(result.pass).toBe(false);
    expect(result.violations.some((v) => v.startsWith('theme_consistent'))).toBe(true);
  });

  it('should fail navConsistent when nav is modified by a non-nav atom', async () => {
    const before = await buildBaseVfs();
    const after = before.clone();
    await after.updateFile(
      'index.html',
      baseHtml.replace('Home', 'Start'),
    );

    const result = validateContinuity(before, after, buildAtom());
    expect(result.pass).toBe(false);
    expect(result.violations.some((v) => v.startsWith('nav_consistent'))).toBe(true);
  });

  it('should fail noUnrelatedChanges when unlisted file is modified', async () => {
    const before = await buildBaseVfs();
    const after = before.clone();
    await after.updateFile(
      'styles.css',
      `${baseCss}\n.hero { padding: 2rem; }`,
    );

    const result = validateContinuity(before, after, buildAtom());
    expect(result.pass).toBe(false);
    expect(result.violations.some((v) => v.startsWith('no_unrelated_changes'))).toBe(true);
  });

  it('should fail sectionCountDelta when count does not match expectation', async () => {
    const before = await buildBaseVfs();
    const after = before.clone();
    const insert = `  <!-- PP:SECTION:features -->
  <section class="features" data-pp-section="features"></section>
  <!-- /PP:SECTION:features -->`;
    await after.updateFile(
      'index.html',
      baseHtml.replace('<!-- /PP:SECTION:hero -->', `<!-- /PP:SECTION:hero -->\n${insert}`),
    );

    const result = validateContinuity(
      before,
      after,
      buildAtom({
        atomType: 'structure',
        expectedSectionDelta: 0,
      }),
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some((v) => v.startsWith('section_count_delta'))).toBe(true);
  });

  it('should fail cssVariableUsage when new CSS contains hardcoded hex color', async () => {
    const before = await buildBaseVfs();
    const after = before.clone();
    await after.updateFile(
      'styles.css',
      `${baseCss}\n.hero { border-color: #ff0000; }`,
    );

    const result = validateContinuity(
      before,
      after,
      buildAtom({
        atomType: 'style',
        filesTouch: ['styles.css'],
      }),
    );

    expect(result.pass).toBe(false);
    expect(result.violations.some((v) => v.startsWith('css_variable_usage'))).toBe(true);
  });
});
