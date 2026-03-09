import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ScaffoldAuditor } from '../../../src/engine/builder/scaffold';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { VfsMetadata } from '../../../src/types/vfs';

interface ScaffoldFixture {
  metadata: VfsMetadata;
  version: number;
  templateId?: string;
  files: Array<{ path: string; content: string }>;
}

const auditor = new ScaffoldAuditor();

function readFixture(relativePath: string): string {
  return readFileSync(new URL(`../../fixtures/${relativePath}`, import.meta.url), 'utf-8');
}

function readJsonFixture<T>(relativePath: string): T {
  return JSON.parse(readFixture(relativePath)) as T;
}

async function createVfsFromFixture(relativePath: string): Promise<VirtualFileSystem> {
  const fixture = readJsonFixture<ScaffoldFixture>(relativePath);
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

describe('ScaffoldAuditor', () => {
  it('should return score 100 for a healthy scaffold', async () => {
    const vfs = await createVfsFromFixture('scaffolds/healthy-scaffold.json');

    const result = auditor.audit(vfs);

    expect(result.score).toBe(100);
    expect(result.issues.length).toBe(0);
    expect(result.sectionsIntact).toBe(result.sectionsTotal);
  });

  it('should detect missing closing PP:SECTION anchor', async () => {
    const vfs = await createVfsFromFixture('scaffolds/corrupted-scaffold.json');

    const result = auditor.audit(vfs);

    expect(result.issues.some((issue) => issue.problem === 'missing_close' && issue.anchor === 'hero')).toBe(true);
  });

  it('should detect missing opening PP:SECTION anchor', async () => {
    const vfs = await createVfsFromFixture('scaffolds/healthy-scaffold.json');
    const file = vfs.getFile('index.html');
    if (!file) {
      throw new Error('Missing index.html fixture');
    }
    const updated = file.content.replace('<!-- PP:SECTION:hero -->', '');
    await vfs.updateFile('index.html', updated);

    const result = auditor.audit(vfs);

    expect(result.issues.some((issue) => issue.problem === 'missing_open' && issue.anchor === 'hero')).toBe(true);
  });

  it('should detect malformed PP:BLOCK anchor (extra whitespace)', async () => {
    const vfs = await createVfsFromFixture('scaffolds/degraded-scaffold.json');

    const result = auditor.audit(vfs);

    expect(result.issues.some((issue) => issue.problem === 'malformed' && issue.file === 'styles.css')).toBe(true);
  });

  it('should detect mismatched data-pp-section attribute', async () => {
    const vfs = await createVfsFromFixture('scaffolds/corrupted-scaffold.json');

    const result = auditor.audit(vfs);

    expect(result.issues.some((issue) => issue.problem === 'mismatched' && issue.anchor === 'nav')).toBe(true);
  });

  it('should detect orphaned closing anchor', async () => {
    const vfs = await createVfsFromFixture('scaffolds/healthy-scaffold.json');
    const file = vfs.getFile('index.html');
    if (!file) {
      throw new Error('Missing index.html fixture');
    }
    const updated = file.content.replace(
      '<!-- PP:SECTION:hero -->',
      '<!-- /PP:SECTION:hero -->\n<!-- PP:SECTION:hero -->',
    );
    await vfs.updateFile('index.html', updated);

    const result = auditor.audit(vfs);

    expect(result.issues.some((issue) => issue.problem === 'orphaned' && issue.anchor === 'hero')).toBe(true);
  });

  it('should calculate correct health score with mixed issues', async () => {
    const vfs = await createVfsFromFixture('scaffolds/degraded-scaffold.json');
    const file = vfs.getFile('index.html');
    if (!file) {
      throw new Error('Missing index.html fixture');
    }
    const updated = file.content.replace('<!-- /PP:SECTION:nav -->', '');
    await vfs.updateFile('index.html', updated);

    const result = auditor.audit(vfs);

    expect(result.score).toBe(75);
  });

  it('should auto-repair normalizable whitespace issues', async () => {
    const vfs = await createVfsFromFixture('scaffolds/degraded-scaffold.json');
    const result = auditor.audit(vfs);

    const repair = await auditor.repair(vfs, result.issues);
    const after = auditor.audit(vfs);

    expect(repair.repaired).toBe(2);
    expect(after.score).toBe(100);
    expect(after.issues.length).toBe(0);
  });

  it('should auto-repair missing closing anchor by inference', async () => {
    const vfs = await createVfsFromFixture('scaffolds/corrupted-scaffold.json');
    const result = auditor.audit(vfs);

    await auditor.repair(vfs, result.issues);
    const html = vfs.getFile('index.html')?.content ?? '';

    expect(html).toContain('<!-- /PP:SECTION:hero -->');
  });

  it('should report unrepairable issues accurately', async () => {
    const vfs = await createVfsFromFixture('scaffolds/corrupted-scaffold.json');
    const result = auditor.audit(vfs);

    const repair = await auditor.repair(vfs, result.issues);

    expect(repair.repaired).toBe(1);
    expect(repair.unrepairable).toBe(1);
  });
});
