import { describe, expect, it, vi } from 'vitest';

import { BuildHeartbeat } from '../../../src/engine/builder/heartbeat';
import type { BuildPhase, BuildState, PhaseTimeouts } from '../../../src/types/build';

const PHASE_TIMEOUTS: PhaseTimeouts = {
  idle: { warn: 0, timeout: 0 },
  assembling_context: { warn: 3000, timeout: 5000 },
  awaiting_llm: { warn: 45000, timeout: 90000 },
  parsing_patch: { warn: 2000, timeout: 5000 },
  validating_patch: { warn: 2000, timeout: 5000 },
  applying_patch: { warn: 2000, timeout: 5000 },
  rendering_preview: { warn: 10000, timeout: 20000 },
  validating_preview: { warn: 10000, timeout: 20000 },
  swapping: { warn: 2000, timeout: 2000 },
  retrying: { warn: 0, timeout: 0 },
  skipping: { warn: 0, timeout: 0 },
  error: { warn: 0, timeout: 0 },
};

function createState(phase: BuildPhase): BuildState {
  const now = Date.now();
  return {
    phase,
    currentAtom: null,
    startedAt: now,
    phaseStartedAt: now,
    retryCount: 0,
    lastError: null,
  };
}

describe('BuildHeartbeat', () => {
  it('should not emit warning before threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const heartbeat = new BuildHeartbeat(PHASE_TIMEOUTS);
    const state = createState('assembling_context');
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    heartbeat.start(state, { onWarning, onTimeout });
    vi.advanceTimersByTime(2000);

    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();

    heartbeat.stop();
    vi.useRealTimers();
  });

  it('should emit warning after warn threshold elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const heartbeat = new BuildHeartbeat(PHASE_TIMEOUTS);
    const state = createState('assembling_context');
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    heartbeat.start(state, { onWarning, onTimeout });
    vi.advanceTimersByTime(3000);

    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();

    heartbeat.stop();
    vi.useRealTimers();
  });

  it('should emit timeout after timeout threshold elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const heartbeat = new BuildHeartbeat(PHASE_TIMEOUTS);
    const state = createState('assembling_context');
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    heartbeat.start(state, { onWarning, onTimeout });
    vi.advanceTimersByTime(5000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onWarning).toHaveBeenCalledTimes(1);

    heartbeat.stop();
    vi.useRealTimers();
  });

  it('should reset phase timer on phase change', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const heartbeat = new BuildHeartbeat(PHASE_TIMEOUTS);
    const state = createState('assembling_context');
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    heartbeat.start(state, { onWarning, onTimeout });
    vi.advanceTimersByTime(2500);
    heartbeat.onPhaseChange('awaiting_llm');
    vi.advanceTimersByTime(4000);

    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(41000);
    expect(onWarning).toHaveBeenCalledTimes(1);

    heartbeat.stop();
    vi.useRealTimers();
  });

  it('should stop emitting after stop() is called', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const heartbeat = new BuildHeartbeat(PHASE_TIMEOUTS);
    const state = createState('assembling_context');
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    heartbeat.start(state, { onWarning, onTimeout });
    heartbeat.stop();
    vi.advanceTimersByTime(6000);

    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should ignore idle phases', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const heartbeat = new BuildHeartbeat(PHASE_TIMEOUTS);
    const state = createState('idle');
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    heartbeat.start(state, { onWarning, onTimeout });
    vi.advanceTimersByTime(10_000);

    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();

    heartbeat.stop();
    vi.useRealTimers();
  });
});
