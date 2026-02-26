import type { BuildPhase, BuildState, PhaseTimeouts } from '../../types/build';

export interface HeartbeatCallbacks {
  onWarning: (phase: BuildPhase, elapsed: number) => void;
  onTimeout: (phase: BuildPhase, elapsed: number) => void;
}

const CHECK_INTERVAL_MS = 1000;
const IGNORED_PHASES: Set<BuildPhase> = new Set([
  'idle',
  'retrying',
  'skipping',
  'error',
]);

export class BuildHeartbeat {
  private phaseTimeouts: PhaseTimeouts;
  private timer: ReturnType<typeof setInterval> | null = null;
  private buildState: BuildState | null = null;
  private callbacks: HeartbeatCallbacks | null = null;
  private lastPhase: BuildPhase | null = null;
  private warned = false;
  private timedOut = false;

  constructor(phaseTimeouts: PhaseTimeouts) {
    this.phaseTimeouts = phaseTimeouts;
  }

  start(buildState: BuildState, callbacks: HeartbeatCallbacks): void {
    this.buildState = buildState;
    this.callbacks = callbacks;
    this.resetPhaseState(buildState.phase);

    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.tick();
    }, CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onPhaseChange(newPhase: BuildPhase): void {
    if (this.buildState) {
      this.buildState.phase = newPhase;
      this.buildState.phaseStartedAt = Date.now();
    }
    this.resetPhaseState(newPhase);
  }

  private resetPhaseState(phase: BuildPhase): void {
    this.lastPhase = phase;
    this.warned = false;
    this.timedOut = false;
  }

  private tick(): void {
    if (!this.buildState || !this.callbacks) {
      return;
    }

    const phase = this.buildState.phase;

    if (this.lastPhase !== phase) {
      this.resetPhaseState(phase);
    }

    if (IGNORED_PHASES.has(phase)) {
      return;
    }

    const thresholds = this.phaseTimeouts[phase];
    if (!thresholds) {
      return;
    }

    const elapsed = Date.now() - this.buildState.phaseStartedAt;

    if (!this.timedOut && thresholds.timeout > 0 && elapsed >= thresholds.timeout) {
      this.timedOut = true;
      this.callbacks.onTimeout(phase, elapsed);
      return;
    }

    if (!this.warned && thresholds.warn > 0 && elapsed >= thresholds.warn) {
      this.warned = true;
      this.callbacks.onWarning(phase, elapsed);
    }
  }
}
