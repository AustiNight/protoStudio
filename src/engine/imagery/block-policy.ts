import type { ImageryTargetSlot } from '@/types/imagery';
import type { ImageryPauseMode } from '@/types/imagery-policy';

type PauseTrigger = 'consecutive' | 'window_count' | 'weighted' | 'same_intent' | 'strict_first_block';

interface ModeConfig {
  windowSize: number;
  consecutiveThreshold: number;
  windowCountThreshold: number;
  weightedThreshold: number;
  sameIntentThreshold: number;
}

interface BlockEvent {
  timestamp: number;
  intentKey: string;
  weight: number;
}

export interface ImageryBlockTracker {
  recent: BlockEvent[];
  consecutive: number;
}

export interface ImageryBlockMetrics {
  consecutive: number;
  windowCount: number;
  weightedScore: number;
  sameIntentCount: number;
}

export interface ImageryBlockDecision {
  nextTracker: ImageryBlockTracker;
  shouldPause: boolean;
  trigger: PauseTrigger | null;
  thresholds: ModeConfig;
  metrics: ImageryBlockMetrics;
}

const MODE_CONFIGS: Record<ImageryPauseMode, ModeConfig> = {
  strict: {
    windowSize: 1,
    consecutiveThreshold: 1,
    windowCountThreshold: 1,
    weightedThreshold: 1,
    sameIntentThreshold: 1,
  },
  balanced: {
    windowSize: 8,
    consecutiveThreshold: 2,
    windowCountThreshold: 3,
    weightedThreshold: 4,
    sameIntentThreshold: 2,
  },
  lenient: {
    windowSize: 10,
    consecutiveThreshold: 3,
    windowCountThreshold: 5,
    weightedThreshold: 6,
    sameIntentThreshold: 3,
  },
};

export function createImageryBlockTracker(): ImageryBlockTracker {
  return {
    recent: [],
    consecutive: 0,
  };
}

export function registerImageryBlock(input: {
  mode: ImageryPauseMode;
  tracker: ImageryBlockTracker;
  intentText: string;
  slots: ImageryTargetSlot[];
  timestamp?: number;
}): ImageryBlockDecision {
  const config = MODE_CONFIGS[input.mode];
  const intentKey = normalizeIntentKey(input.intentText);
  const event: BlockEvent = {
    timestamp: input.timestamp ?? Date.now(),
    intentKey,
    weight: computeWeight(input.slots),
  };
  const recent = [...input.tracker.recent, event].slice(-config.windowSize);
  const consecutive = input.tracker.consecutive + 1;
  const windowCount = recent.length;
  const weightedScore = recent.reduce((sum, item) => sum + item.weight, 0);
  const sameIntentCount = recent.filter((item) => item.intentKey === intentKey).length;
  const metrics: ImageryBlockMetrics = {
    consecutive,
    windowCount,
    weightedScore,
    sameIntentCount,
  };
  const trigger = resolveTrigger(input.mode, metrics, config);

  return {
    nextTracker: {
      recent,
      consecutive,
    },
    shouldPause: trigger !== null,
    trigger,
    thresholds: config,
    metrics,
  };
}

export function clearImageryConsecutiveBlocks(
  tracker: ImageryBlockTracker,
): ImageryBlockTracker {
  return {
    recent: tracker.recent,
    consecutive: 0,
  };
}

export function resetImageryBlockTracker(): ImageryBlockTracker {
  return createImageryBlockTracker();
}

export function formatImageryPauseProgress(
  mode: ImageryPauseMode,
  decision: Pick<ImageryBlockDecision, 'metrics' | 'thresholds'>,
): string {
  if (mode === 'strict') {
    return 'Auto-pause mode: strict (pause on first imagery block).';
  }
  return [
    `Auto-pause progress (${mode}): consecutive ${decision.metrics.consecutive}/${decision.thresholds.consecutiveThreshold}`,
    `window ${decision.metrics.windowCount}/${decision.thresholds.windowCountThreshold}`,
    `weighted ${decision.metrics.weightedScore}/${decision.thresholds.weightedThreshold}`,
    `same intent ${decision.metrics.sameIntentCount}/${decision.thresholds.sameIntentThreshold}.`,
  ].join(' · ');
}

export function formatPauseTrigger(trigger: PauseTrigger | null): string {
  switch (trigger) {
    case 'strict_first_block':
      return 'first imagery block in strict mode';
    case 'consecutive':
      return 'consecutive imagery block threshold';
    case 'window_count':
      return 'rolling window imagery block threshold';
    case 'weighted':
      return 'weighted severity threshold';
    case 'same_intent':
      return 'same-intent imagery block threshold';
    default:
      return 'imagery block threshold';
  }
}

function resolveTrigger(
  mode: ImageryPauseMode,
  metrics: ImageryBlockMetrics,
  config: ModeConfig,
): PauseTrigger | null {
  if (mode === 'strict') {
    return 'strict_first_block';
  }
  if (metrics.consecutive >= config.consecutiveThreshold) {
    return 'consecutive';
  }
  if (metrics.sameIntentCount >= config.sameIntentThreshold) {
    return 'same_intent';
  }
  if (metrics.windowCount >= config.windowCountThreshold) {
    return 'window_count';
  }
  if (metrics.weightedScore >= config.weightedThreshold) {
    return 'weighted';
  }
  return null;
}

function computeWeight(slots: ImageryTargetSlot[]): number {
  const critical = new Set<ImageryTargetSlot>([
    'og:image',
    'favicon',
    'schema:image',
    'schema:contact',
    'logo',
    'hero',
  ]);
  const hasCritical = slots.some((slot) => critical.has(slot));
  return hasCritical ? 2 : 1;
}

function normalizeIntentKey(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0 ? normalized.slice(0, 140) : 'imagery-intent';
}
