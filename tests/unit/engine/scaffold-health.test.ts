import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ScaffoldAuditor } from '../../../src/engine/builder/scaffold';
import { ScaffoldHealthManager } from '../../../src/engine/builder/scaffold-health';
import { VFSSnapshotManager } from '../../../src/engine/vfs/snapshots';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { VfsMetadata } from '../../../src/types/vfs';

interface ScaffoldFixture {
  metadata: VfsMetadata;
  version: number;
  templateId?: string;
  files: Array<{ path: string; content: string }>;
}

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

describe('ScaffoldHealthManager', () => {
  it('should save snapshot when scaffold is healthy', async () => {
    const vfs = await createVfsFromFixture('scaffolds/healthy-scaffold.json');
    const snapshots = new VFSSnapshotManager();
    const manager = new ScaffoldHealthManager({ snapshots });

    const result = await manager.evaluate(vfs);

    expect(result.status).toBe('healthy');
    expect(result.rolledBack).toBe(false);
    expect(snapshots.getSnapshotCount()).toBe(1);
    expect(snapshots.getLatestSnapshot()?.version).toBe(vfs.getVersion());
  });

  it('should auto-repair degraded scaffold and save snapshot', async () => {
    const vfs = await createVfsFromFixture('scaffolds/degraded-scaffold.json');
    const snapshots = new VFSSnapshotManager();
    const manager = new ScaffoldHealthManager({ snapshots });

    const result = await manager.evaluate(vfs);
    const audit = new ScaffoldAuditor().audit(vfs);

    expect(result.repaired).toBeGreaterThan(0);
    expect(result.status).toBe('healthy');
    expect(audit.score).toBe(100);
    expect(snapshots.getSnapshotCount()).toBe(1);
  });

  it('should rollback when scaffold health is critical', async () => {
    const healthyVfs = await createVfsFromFixture('scaffolds/healthy-scaffold.json');
    const snapshots = new VFSSnapshotManager();
    snapshots.saveSnapshot(healthyVfs);

    const criticalVfs = await createVfsFromFixture('scaffolds/corrupted-scaffold.json');
    criticalVfs.version = 5;
    const file = criticalVfs.getFile('index.html');
    if (!file) {
      throw new Error('Missing index.html fixture');
    }

    const updated = file.content
      .replace('<!-- /PP:SECTION:nav -->', '')
      .replace('<!-- PP:SECTION:footer -->', '');
    await criticalVfs.updateFile('index.html', updated);

    const manager = new ScaffoldHealthManager({ snapshots });
    const result = await manager.evaluate(criticalVfs);

    expect(result.status).toBe('critical');
    expect(result.rolledBack).toBe(true);
    expect(result.lostVersions).toBe(4);
    expect(criticalVfs.getVersion()).toBe(healthyVfs.getVersion());
    expect(criticalVfs.metadata.title).toBe(healthyVfs.metadata.title);
  });
});
