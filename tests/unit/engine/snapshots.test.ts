import { describe, expect, it } from 'vitest';

import { VFSSnapshotManager } from '../../../src/engine/vfs/snapshots';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { VfsMetadata } from '../../../src/types/vfs';

const baseMetadata: VfsMetadata = {
  title: 'Snapshot Test',
  description: 'Testing snapshots',
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

function createVfs(version: number): VirtualFileSystem {
  return new VirtualFileSystem({ metadata: buildMetadata(), version });
}

describe('VFSSnapshotManager', () => {
  it('should save a snapshot and retrieve it by version', async () => {
    const manager = new VFSSnapshotManager();
    const vfs = createVfs(1);
    await vfs.addFile('index.html', '<html></html>');

    manager.saveSnapshot(vfs);
    const snapshot = manager.getSnapshot(1);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.getFile('index.html')?.content).toBe('<html></html>');
    expect(snapshot).not.toBe(vfs);
  });

  it('should prune oldest snapshot when max capacity is reached', () => {
    const manager = new VFSSnapshotManager(2);
    manager.saveSnapshot(createVfs(1));
    manager.saveSnapshot(createVfs(2));
    manager.saveSnapshot(createVfs(3));

    expect(manager.getSnapshotCount()).toBe(2);
    expect(manager.getSnapshot(1)).toBeNull();
    expect(manager.getSnapshot(2)).not.toBeNull();
    expect(manager.getSnapshot(3)).not.toBeNull();
  });

  it('should return latest snapshot on rollback', () => {
    const manager = new VFSSnapshotManager();
    manager.saveSnapshot(createVfs(1));
    manager.saveSnapshot(createVfs(2));

    const rollback = manager.rollback();
    expect(rollback).not.toBeNull();
    expect(rollback?.vfs.getVersion()).toBe(2);
  });

  it('should report correct lostVersions count on rollback', () => {
    const manager = new VFSSnapshotManager();
    manager.saveSnapshot(createVfs(2));
    manager.saveSnapshot(createVfs(3));

    const rollback = manager.rollback(6);
    expect(rollback).not.toBeNull();
    expect(rollback?.lostVersions).toBe(3);
  });

  it('should return null when no snapshots exist', () => {
    const manager = new VFSSnapshotManager();
    expect(manager.getSnapshot(1)).toBeNull();
    expect(manager.getLatestSnapshot()).toBeNull();
    expect(manager.rollback()).toBeNull();
  });

  it('should clear all snapshots', () => {
    const manager = new VFSSnapshotManager();
    manager.saveSnapshot(createVfs(1));
    manager.clear();

    expect(manager.getSnapshotCount()).toBe(0);
    expect(manager.getSnapshot(1)).toBeNull();
  });
});
