import type { PricingConfig } from '../types/pricing';

export const OPENAI_MODEL_MAX_STALE_DAYS = 45;

const OFFICIAL_OPENAI_HOSTS = new Set(['platform.openai.com', 'developers.openai.com']);

export interface PricingValidationIssue {
  message: string;
  modelId?: string;
}

export interface PricingValidationOptions {
  enforceFreshness?: boolean;
  maxStaleDays?: number;
  now?: Date;
}

export function isOpenAIModelId(modelId: string): boolean {
  if (modelId.startsWith('gpt-')) {
    return true;
  }
  return /^o[0-9][a-z0-9-]*$/i.test(modelId);
}

export function isOfficialOpenAISourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && OFFICIAL_OPENAI_HOSTS.has(parsed.hostname);
  } catch (error) {
    return false;
  }
}

export function validatePricingConfig(
  value: unknown,
  options: PricingValidationOptions = {},
): PricingValidationIssue[] {
  const issues: PricingValidationIssue[] = [];
  const enforceFreshness = options.enforceFreshness === true;
  const maxStaleDays = options.maxStaleDays ?? OPENAI_MODEL_MAX_STALE_DAYS;
  const now = options.now ?? new Date();
  if (!isRecord(value)) {
    return [{ message: 'Pricing config must be an object.' }];
  }

  if (typeof value.lastUpdated !== 'string') {
    issues.push({ message: 'Pricing config must define lastUpdated as a string.' });
  } else if (!isIsoDateOnly(value.lastUpdated)) {
    issues.push({ message: 'Pricing config lastUpdated must use YYYY-MM-DD format.' });
  } else if (enforceFreshness) {
    const age = daysSinceDate(value.lastUpdated, now);
    if (age === null) {
      issues.push({ message: 'Pricing config lastUpdated must be a valid UTC date.' });
    } else if (age > maxStaleDays) {
      issues.push({
        message: `Pricing config lastUpdated is ${age} days old; maximum allowed is ${maxStaleDays}.`,
      });
    }
  }

  if (!isRecord(value.models)) {
    issues.push({ message: 'Pricing config must define models as an object.' });
    return issues;
  }

  for (const [modelId, entry] of Object.entries(value.models)) {
    if (!isRecord(entry)) {
      issues.push({ modelId, message: 'Model entry must be an object.' });
      continue;
    }

    if (!isFiniteNumber(entry.promptPer1K)) {
      issues.push({ modelId, message: 'promptPer1K must be a finite number.' });
    }
    if (!isFiniteNumber(entry.completionPer1K)) {
      issues.push({ modelId, message: 'completionPer1K must be a finite number.' });
    }

    if (!isOpenAIModelId(modelId)) {
      continue;
    }

    if (!Array.isArray(entry.sourceUrls) || entry.sourceUrls.length === 0) {
      issues.push({
        modelId,
        message:
          'OpenAI model entries must include sourceUrls with official docs references.',
      });
    } else {
      for (const sourceUrl of entry.sourceUrls) {
        if (typeof sourceUrl !== 'string' || !isOfficialOpenAISourceUrl(sourceUrl)) {
          issues.push({
            modelId,
            message: `Invalid sourceUrls entry: ${String(sourceUrl)}`,
          });
        }
      }
    }

    if (!isIsoDateOnly(entry.reviewedAt)) {
      issues.push({
        modelId,
        message: 'reviewedAt must use YYYY-MM-DD format.',
      });
      continue;
    }

    if (enforceFreshness) {
      const age = daysSinceDate(entry.reviewedAt, now);
      if (age === null) {
        issues.push({
          modelId,
          message: 'reviewedAt must be a valid UTC date.',
        });
      } else if (age > maxStaleDays) {
        issues.push({
          modelId,
          message: `reviewedAt is ${age} days old; maximum allowed is ${maxStaleDays}.`,
        });
      }
    }
  }

  return issues;
}

export function isPricingConfig(value: unknown): value is PricingConfig {
  return validatePricingConfig(value, { enforceFreshness: false }).length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysSinceDate(value: string, now: Date): number | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    return 0;
  }
  return Math.floor(diffMs / 86_400_000);
}
