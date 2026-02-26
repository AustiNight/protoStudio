import { VirtualFileSystem } from './vfs';

interface SnapshotEntry {
  vfs: VirtualFileSystem;
  version: number;
}

export class VFSSnapshotManager {
  private snapshots: Map<number, VirtualFileSystem> = new Map();
  private maxSnapshots: number;
  private latestVersionSeen: number | null = null;

  constructor(maxSnapshots = 5) {
    this.maxSnapshots = maxSnapshots;
  }

  saveSnapshot(vfs: VirtualFileSystem): void {
    this.latestVersionSeen = Math.max(this.latestVersionSeen ?? vfs.version, vfs.version);
    this.snapshots.set(vfs.version, vfs.clone());
    this.pruneIfNeeded();
  }

  getSnapshot(version: number): VirtualFileSystem | null {
    const snapshot = this.snapshots.get(version);
    return snapshot ? snapshot.clone() : null;
  }

  getLatestSnapshot(): SnapshotEntry | null {
    if (this.snapshots.size === 0) {
      return null;
    }

    const latestVersion = Math.max(...this.snapshots.keys());
    const snapshot = this.snapshots.get(latestVersion);
    if (!snapshot) {
      return null;
    }

    return {
      vfs: snapshot.clone(),
      version: latestVersion,
    };
  }

  rollback(currentVersion?: number): { vfs: VirtualFileSystem; lostVersions: number } | null {
    const latest = this.getLatestSnapshot();
    if (!latest) {
      return null;
    }

    const knownVersion =
      typeof currentVersion === 'number'
        ? currentVersion
        : this.latestVersionSeen ?? latest.version;
    const lostVersions = Math.max(0, knownVersion - latest.version);

    return {
      vfs: latest.vfs,
      lostVersions,
    };
  }

  getSnapshotCount(): number {
    return this.snapshots.size;
  }

  clear(): void {
    this.snapshots.clear();
    this.latestVersionSeen = null;
  }

  private pruneIfNeeded(): void {
    while (this.snapshots.size > this.maxSnapshots) {
      const oldestVersion = Math.min(...this.snapshots.keys());
      this.snapshots.delete(oldestVersion);
    }
  }
}
