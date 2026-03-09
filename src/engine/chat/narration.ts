import type { AtomType, WorkItem } from '../../types/backlog';
import type { BuildState, PhaseTimeouts } from '../../types/build';

export type StatusBarColor = 'green' | 'amber' | 'red' | 'gray';

const PHASE_TIMEOUTS: PhaseTimeouts = {
  idle: { warn: 0, timeout: 0 },
  assembling_context: { warn: 3000, timeout: 5000 },
  awaiting_llm: { warn: 45_000, timeout: 90_000 },
  parsing_patch: { warn: 2000, timeout: 5000 },
  validating_patch: { warn: 2000, timeout: 5000 },
  applying_patch: { warn: 2000, timeout: 5000 },
  rendering_preview: { warn: 10_000, timeout: 20_000 },
  validating_preview: { warn: 10_000, timeout: 20_000 },
  swapping: { warn: 2000, timeout: 2000 },
  retrying: { warn: 0, timeout: 0 },
  skipping: { warn: 0, timeout: 0 },
  error: { warn: 0, timeout: 0 },
};

const VERBS_BY_ATOM: Record<AtomType, string[]> = {
  structure: ['Building', 'Constructing', 'Setting up', 'Creating'],
  content: ['Writing', 'Crafting', 'Composing', 'Filling in'],
  style: ['Styling', 'Polishing', 'Refining', 'Tuning'],
  behavior: ['Wiring up', 'Adding interactivity to', 'Programming', 'Connecting'],
  integration: ['Connecting', 'Integrating', 'Setting up', 'Linking'],
};

const DEFAULT_VERBS = ['Working on'];
const SLOW_MESSAGE_INTERVAL_MS = 8000;

export function getStatusBarText(state: BuildState): string {
  const atom = state.currentAtom;
  const elapsed = Math.max(0, Date.now() - state.phaseStartedAt);
  const thresholds = PHASE_TIMEOUTS[state.phase];

  switch (state.phase) {
    case 'idle':
      return 'Idle - waiting for next build';
    case 'assembling_context':
      return atom
        ? `Preparing to work on "${atom.title}"...`
        : 'Preparing the next update...';
    case 'awaiting_llm': {
      if (!atom) {
        return 'Working on your updates...';
      }
      if (thresholds && thresholds.warn > 0 && elapsed >= thresholds.warn) {
        return getSlowMessages({ ...atom, createdAt: state.phaseStartedAt }, state.retryCount);
      }
      return getBuildingMessages(atom);
    }
    case 'parsing_patch':
    case 'validating_patch':
    case 'applying_patch':
      return 'Checking the changes...';
    case 'rendering_preview':
    case 'validating_preview':
      return 'Previewing the changes...';
    case 'swapping':
      return 'Updated!';
    case 'retrying':
      if (state.retryCount <= 2 && atom) {
        return getBuildingMessages(atom);
      }
      return 'Trying a different approach...';
    case 'skipping':
      return atom
        ? `Moved on - couldn't build "${atom.title}" this time`
        : 'Moved on - skipping this update';
    case 'error':
      return 'Paused - check the chat for details';
    default:
      return 'Working on your updates...';
  }
}

export function getStatusBarColor(state: BuildState): StatusBarColor {
  if (state.phase === 'idle') {
    return 'gray';
  }

  if (state.phase === 'error') {
    return 'red';
  }

  const thresholds = PHASE_TIMEOUTS[state.phase];
  const elapsed = Math.max(0, Date.now() - state.phaseStartedAt);

  if (thresholds && thresholds.warn > 0 && elapsed >= thresholds.warn) {
    return 'amber';
  }

  return 'green';
}

export function getSwapChatMessage(atom: WorkItem): string {
  const templates: Record<AtomType, string> = {
    structure: 'Added: **%s**',
    content: 'Updated: **%s**',
    style: 'Styled: **%s**',
    behavior: 'Connected: **%s**',
    integration: 'Integrated: **%s**',
  };

  const template = templates[atom.atomType] ?? 'Updated: **%s**';
  return template.replace('%s', atom.visibleChange);
}

export function getSkipChatMessage(atom: WorkItem, nextAtom: WorkItem | null): string {
  const nextLine = nextAtom
    ? `In the meantime, I'm working on "${nextAtom.title}" next.`
    : 'I will pause here until you tell me what to tackle next.';

  return (
    `I couldn't build "${atom.title}" after a few tries. ` +
    "I've moved it to the end of the backlog and I'll take another approach when we get back to it. " +
    nextLine
  );
}

export function getErrorChatMessage(error: string, remediation: string): string {
  const trimmedError = error.trim();
  const trimmedRemediation = remediation.trim();

  if (trimmedRemediation) {
    return (
      `Warning: ${trimmedError}\n\n${trimmedRemediation}\n\n` +
      "I've paused building until this is resolved."
    );
  }

  return `Warning: ${trimmedError}\n\nI've paused building until this is resolved.`;
}

export function getMilestoneChatMessage(
  type: 'first_preview' | 'deployed',
  data: Record<string, string>,
): string {
  if (type === 'first_preview') {
    const previewUrl = data.previewUrl ?? data.url ?? '';
    const urlLine = previewUrl ? `Your site is live in the preview at: ${previewUrl}` :
      'Your site is live in the preview.';

    return (
      '**First preview ready!**\n' +
      `${urlLine} Take a look and tell me what you want changed first.`
    );
  }

  const deployUrl = data.url ?? data.deployUrl ?? data.liveUrl ?? '';
  const deployLine = deployUrl ? `Your site is live at: ${deployUrl}` : 'Your site is live.';

  return (
    '**Deployed!**\n' +
    `${deployLine}\n` +
    'I have prepared a documentation packet with everything you need to know.'
  );
}

export function getBuildingMessages(atom: WorkItem): string {
  const verbs = VERBS_BY_ATOM[atom.atomType] ?? DEFAULT_VERBS;
  const seed = `${atom.id}:${atom.title}:${atom.atomType}`;
  const verb = pickDeterministic(verbs, seed);
  const title = atom.title.trim();
  const subject = title ? title.toLowerCase() : 'update';

  return `${verb} your ${subject}...`;
}

export function getSlowMessages(atom: WorkItem, retryCount: number): string {
  const messages = [
    `Still working on "${atom.title}" - this one needs a bit more thought...`,
    'Almost there - making sure everything fits together...',
    'Taking a little longer than usual - good things take time...',
    'Putting the finishing touches on this piece...',
  ];

  if (retryCount > 0) {
    messages.push(
      `Trying a slightly different approach to "${atom.title}"...`,
      'Rethinking this one - want to get it right...',
    );
  }

  const startedAt = Number.isFinite(atom.createdAt) ? atom.createdAt : Date.now();
  const elapsed = Math.max(0, Date.now() - startedAt);
  const index = Math.floor(elapsed / SLOW_MESSAGE_INTERVAL_MS) % messages.length;

  return messages[index];
}

function pickDeterministic(options: string[], seed: string): string {
  if (options.length === 0) {
    return '';
  }

  const hash = hashString(seed);
  return options[hash % options.length];
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}
