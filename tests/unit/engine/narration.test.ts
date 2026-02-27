import { describe, expect, it, vi } from 'vitest';

import {
  getBuildingMessages,
  getMilestoneChatMessage,
  getSkipChatMessage,
  getSlowMessages,
  getStatusBarColor,
  getStatusBarText,
  getSwapChatMessage,
} from '../../../src/engine/chat/narration';
import type { WorkItem } from '../../../src/types/backlog';
import type { BuildPhase, BuildState } from '../../../src/types/build';

const BASE_ATOM: WorkItem = {
  id: 'atom-1',
  sessionId: 'session-1',
  title: 'Services Section',
  description: 'Add services section content.',
  effort: 'S',
  status: 'on_deck',
  order: 0,
  dependencies: [],
  rationale: 'Improve the homepage.',
  createdAt: 0,
  atomType: 'structure',
  filesTouch: ['index.html'],
  estimatedLines: 40,
  visibleChange: 'New services section appears on the homepage',
};

function makeAtom(overrides: Partial<WorkItem> = {}): WorkItem {
  return { ...BASE_ATOM, ...overrides };
}

function createState(phase: BuildPhase, overrides: Partial<BuildState> = {}): BuildState {
  const now = Date.now();
  return {
    phase,
    currentAtom: makeAtom(),
    startedAt: now,
    phaseStartedAt: now,
    retryCount: 0,
    lastError: null,
    ...overrides,
  };
}

describe('narration', () => {
  it('should return contextual verb for structure atom', () => {
    const message = getBuildingMessages(makeAtom({ atomType: 'structure', title: 'Services Section' }));
    expect(message).toMatch(/^(Building|Constructing|Setting up|Creating) your services section\.\.\.$/);
  });

  it('should return contextual verb for style atom', () => {
    const message = getBuildingMessages(makeAtom({ atomType: 'style', title: 'Color Palette' }));
    expect(message).toMatch(/^(Styling|Polishing|Refining|Tuning) your color palette\.\.\.$/);
  });

  it('should return green color for normal awaiting_llm phase', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const state = createState('awaiting_llm');

    expect(getStatusBarColor(state)).toBe('green');

    vi.useRealTimers();
  });

  it('should return amber color when awaiting_llm exceeds warning threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const state = createState('awaiting_llm', { phaseStartedAt: 0 });

    vi.setSystemTime(50_000);
    expect(getStatusBarColor(state)).toBe('amber');

    vi.useRealTimers();
  });

  it('should return red color for error phase', () => {
    const state = createState('error');
    expect(getStatusBarColor(state)).toBe('red');
  });

  it('should return gray color for idle phase', () => {
    const state = createState('idle');
    expect(getStatusBarColor(state)).toBe('gray');
  });

  it('should generate swap message using atom\'s visibleChange', () => {
    const atom = makeAtom({
      atomType: 'structure',
      visibleChange: 'New services section appears on the homepage',
    });

    expect(getSwapChatMessage(atom)).toBe(
      'Added: **New services section appears on the homepage**',
    );
  });

  it('should generate skip message referencing next atom title', () => {
    const current = makeAtom({ title: 'Add filterable portfolio grid' });
    const next = makeAtom({ id: 'atom-2', title: 'Add about section copy' });
    const message = getSkipChatMessage(current, next);

    expect(message).toContain('Add about section copy');
  });

  it('should rotate slow messages based on elapsed time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const atom = makeAtom({ createdAt: 0 });

    const first = getSlowMessages(atom, 0);
    vi.setSystemTime(8000);
    const second = getSlowMessages(atom, 0);

    expect(second).not.toEqual(first);

    vi.useRealTimers();
  });

  it('should generate milestone message with deploy URL', () => {
    const message = getMilestoneChatMessage('deployed', { url: 'https://example.com' });

    expect(message).toContain('https://example.com');
  });

  it('should return slow messaging after warn threshold in awaiting_llm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const atom = makeAtom({ title: 'Services Section' });
    const state = createState('awaiting_llm', {
      currentAtom: atom,
      phaseStartedAt: 0,
    });

    vi.setSystemTime(50_000);
    const text = getStatusBarText(state);

    expect(text).toMatch(
      /(Still working on|Almost there|Taking a little longer|Putting the finishing touches|Trying a slightly different approach|Rethinking this one)/,
    );

    vi.useRealTimers();
  });

  it('should map swapping phase to updated status text', () => {
    const state = createState('swapping');
    expect(getStatusBarText(state)).toBe('Updated!');
  });
});
