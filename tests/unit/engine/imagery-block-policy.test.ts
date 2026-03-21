import { describe, expect, it } from 'vitest';

import {
  clearImageryConsecutiveBlocks,
  createImageryBlockTracker,
  formatImageryPauseProgress,
  registerImageryBlock,
} from '../../../src/engine/imagery/block-policy';

describe('imagery block policy', () => {
  it('pauses immediately in strict mode', () => {
    const tracker = createImageryBlockTracker();
    const decision = registerImageryBlock({
      mode: 'strict',
      tracker,
      intentText: 'Replace OG image',
      slots: ['og:image'],
      timestamp: 100,
    });

    expect(decision.shouldPause).toBe(true);
    expect(decision.trigger).toBe('strict_first_block');
  });

  it('does not pause first balanced block but pauses on second consecutive', () => {
    const first = registerImageryBlock({
      mode: 'balanced',
      tracker: createImageryBlockTracker(),
      intentText: 'Add hero dog illustration',
      slots: ['hero'],
      timestamp: 100,
    });
    expect(first.shouldPause).toBe(false);

    const second = registerImageryBlock({
      mode: 'balanced',
      tracker: first.nextTracker,
      intentText: 'Add palm tree illustration',
      slots: ['hero'],
      timestamp: 200,
    });
    expect(second.shouldPause).toBe(true);
    expect(second.trigger).toBe('consecutive');
  });

  it('pauses balanced mode when same intent repeats even if not consecutive history reset', () => {
    const first = registerImageryBlock({
      mode: 'balanced',
      tracker: createImageryBlockTracker(),
      intentText: 'Replace OG image with branded thumbnail',
      slots: ['og:image'],
      timestamp: 100,
    });
    const resetConsecutive = clearImageryConsecutiveBlocks(first.nextTracker);
    const second = registerImageryBlock({
      mode: 'balanced',
      tracker: resetConsecutive,
      intentText: 'Replace OG image with branded thumbnail',
      slots: ['og:image'],
      timestamp: 200,
    });

    expect(second.shouldPause).toBe(true);
    expect(second.trigger).toBe('same_intent');
  });

  it('pauses lenient mode at rolling window count threshold', () => {
    let tracker = createImageryBlockTracker();
    let lastDecision = null as ReturnType<typeof registerImageryBlock> | null;
    for (let index = 0; index < 5; index += 1) {
      lastDecision = registerImageryBlock({
        mode: 'lenient',
        tracker,
        intentText: `Decorative pattern ${index}`,
        slots: ['general'],
        timestamp: 100 + index,
      });
      tracker = clearImageryConsecutiveBlocks(lastDecision.nextTracker);
    }

    expect(lastDecision).not.toBeNull();
    expect(lastDecision?.shouldPause).toBe(true);
    expect(lastDecision?.trigger).toBe('window_count');
  });

  it('formats balanced progress details', () => {
    const decision = registerImageryBlock({
      mode: 'balanced',
      tracker: createImageryBlockTracker(),
      intentText: 'Add logo artwork',
      slots: ['logo'],
      timestamp: 100,
    });
    const progress = formatImageryPauseProgress('balanced', decision);
    expect(progress).toContain('consecutive 1/2');
    expect(progress).toContain('window 1/3');
  });
});
