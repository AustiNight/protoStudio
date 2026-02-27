import type { RepairResult, ScaffoldHealth } from '../../types/build';

import { VFSSnapshotManager } from '../vfs/snapshots';
import { VirtualFileSystem } from '../vfs/vfs';
import { ScaffoldAuditor } from './scaffold';

export type ScaffoldHealthStatus = 'healthy' | 'degraded' | 'at_risk' | 'critical';

export interface ScaffoldHealthOutcome {
  status: ScaffoldHealthStatus;
  health: ScaffoldHealth;
  repaired: number;
  unrepairable: number;
  rolledBack: boolean;
  lostVersions?: number;
}

export interface ScaffoldHealthThresholds {
  healthy: number;
  degraded: number;
  critical: number;
}

export interface ScaffoldHealthManagerOptions {
  auditor?: ScaffoldAuditor;
  snapshots?: VFSSnapshotManager | null;
  thresholds?: Partial<ScaffoldHealthThresholds>;
}

const DEFAULT_THRESHOLDS: ScaffoldHealthThresholds = {
  healthy: 90,
  degraded: 70,
  critical: 50,
};

const EMPTY_REPAIR: RepairResult = { repaired: 0, unrepairable: 0 };

export class ScaffoldHealthManager {
  private auditor: ScaffoldAuditor;
  private snapshots: VFSSnapshotManager | null;
  private thresholds: ScaffoldHealthThresholds;

  constructor(options: ScaffoldHealthManagerOptions = {}) {
    this.auditor = options.auditor ?? new ScaffoldAuditor();
    this.snapshots =
      options.snapshots === undefined ? new VFSSnapshotManager() : options.snapshots;
    this.thresholds = normalizeThresholds(options.thresholds);
  }

  async evaluate(vfs: VirtualFileSystem): Promise<ScaffoldHealthOutcome> {
    const health = this.auditor.audit(vfs);
    const status = this.classify(health.score);

    if (status === 'healthy') {
      this.saveSnapshot(vfs);
      return this.buildOutcome(status, health, EMPTY_REPAIR, false);
    }

    if (status === 'critical') {
      return this.rollbackIfPossible(vfs, health, EMPTY_REPAIR);
    }

    const repair = await this.auditor.repair(vfs, health.issues);
    const repairedHealth = this.auditor.audit(vfs);
    const repairedStatus = this.classify(repairedHealth.score);

    if (repairedStatus === 'healthy') {
      this.saveSnapshot(vfs);
      return this.buildOutcome(repairedStatus, repairedHealth, repair, false);
    }

    if (repairedStatus === 'critical') {
      return this.rollbackIfPossible(vfs, repairedHealth, repair);
    }

    return this.buildOutcome(repairedStatus, repairedHealth, repair, false);
  }

  private classify(score: number): ScaffoldHealthStatus {
    if (score >= this.thresholds.healthy) {
      return 'healthy';
    }
    if (score >= this.thresholds.degraded) {
      return 'degraded';
    }
    if (score >= this.thresholds.critical) {
      return 'at_risk';
    }
    return 'critical';
  }

  private saveSnapshot(vfs: VirtualFileSystem): void {
    this.snapshots?.saveSnapshot(vfs);
  }

  private rollbackIfPossible(
    vfs: VirtualFileSystem,
    health: ScaffoldHealth,
    repair: RepairResult,
  ): ScaffoldHealthOutcome {
    const rollback = this.snapshots?.rollback(vfs.getVersion()) ?? null;
    if (!rollback) {
      return this.buildOutcome('critical', health, repair, false);
    }

    vfs.replaceWith(rollback.vfs);
    return this.buildOutcome('critical', health, repair, true, rollback.lostVersions);
  }

  private buildOutcome(
    status: ScaffoldHealthStatus,
    health: ScaffoldHealth,
    repair: RepairResult,
    rolledBack: boolean,
    lostVersions?: number,
  ): ScaffoldHealthOutcome {
    return {
      status,
      health,
      repaired: repair.repaired,
      unrepairable: repair.unrepairable,
      rolledBack,
      lostVersions,
    };
  }
}

function normalizeThresholds(
  thresholds?: Partial<ScaffoldHealthThresholds>,
): ScaffoldHealthThresholds {
  if (!thresholds) {
    return { ...DEFAULT_THRESHOLDS };
  }

  const healthy = sanitizeScore(thresholds.healthy, DEFAULT_THRESHOLDS.healthy);
  const degraded = sanitizeScore(thresholds.degraded, DEFAULT_THRESHOLDS.degraded);
  const critical = sanitizeScore(thresholds.critical, DEFAULT_THRESHOLDS.critical);

  if (healthy < degraded || degraded < critical) {
    return { ...DEFAULT_THRESHOLDS };
  }

  return { healthy, degraded, critical };
}

function sanitizeScore(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded < 0) {
    return 0;
  }
  if (rounded > 100) {
    return 100;
  }
  return rounded;
}
