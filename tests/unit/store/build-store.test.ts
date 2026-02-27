import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBuildStore } from '../../../src/store/build-store';

const baseTime = new Date('2026-02-27T12:00:00.000Z');

describe('build-store', () => {
  beforeEach(() => {
    useBuildStore.getState().resetStore();
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should update build phase and track timing', () => {
    useBuildStore.getState().setPhase('assembling_context');
    const firstPhaseStartedAt = useBuildStore.getState().buildState.phaseStartedAt;
    expect(firstPhaseStartedAt).toBe(baseTime.getTime());

    vi.advanceTimersByTime(2500);
    useBuildStore.getState().setPhase('awaiting_llm');
    const secondPhaseStartedAt = useBuildStore.getState().buildState.phaseStartedAt;
    expect(secondPhaseStartedAt).toBe(baseTime.getTime() + 2500);
  });

  it('should track pause/resume state in build store', () => {
    useBuildStore.getState().pauseBuild();
    expect(useBuildStore.getState().isPaused).toBe(true);

    useBuildStore.getState().resumeBuild();
    expect(useBuildStore.getState().isPaused).toBe(false);
  });
});
