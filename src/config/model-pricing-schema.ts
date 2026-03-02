import type { PricingConfig } from '../types/pricing';

export const OPENAI_MODEL_REVIEW_DATE = '2026-03-02';

const OFFICIAL_OPENAI_HOSTS = new Set(['platform.openai.com', 'developers.openai.com']);

export interface PricingValidationIssue {
  message: string;
  modelId?: string;
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

export function validatePricingConfig(value: unknown): PricingValidationIssue[] {
  const issues: PricingValidationIssue[] = [];
  if (!isRecord(value)) {
    return [{ message: 'Pricing config must be an object.' }];
  }

  if (typeof value.lastUpdated !== 'string') {
    issues.push({ message: 'Pricing config must define lastUpdated as a string.' });
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

    if (entry.reviewedAt !== OPENAI_MODEL_REVIEW_DATE) {
      issues.push({
        modelId,
        message: `reviewedAt must be ${OPENAI_MODEL_REVIEW_DATE}.`,
      });
    }
  }

  return issues;
}

export function isPricingConfig(value: unknown): value is PricingConfig {
  return validatePricingConfig(value).length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
