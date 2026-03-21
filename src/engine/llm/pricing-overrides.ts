import type { ModelPricing, PricingConfig } from '@/types/pricing';

const PRICING_OVERRIDES_STORAGE_KEY = 'protoStudio.pricing.overrides.v1';
export const PRICING_OVERRIDES_UPDATED_EVENT = 'pricing:overrides-updated';

type PricingOverrideMap = Record<string, ModelPricing>;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readPricingOverrides(): PricingOverrideMap {
  if (!canUseStorage()) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(PRICING_OVERRIDES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const next: PricingOverrideMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const prompt = (value as Record<string, unknown>).promptPer1K;
      const completion = (value as Record<string, unknown>).completionPer1K;
      if (typeof prompt !== 'number' || !Number.isFinite(prompt)) {
        continue;
      }
      if (typeof completion !== 'number' || !Number.isFinite(completion)) {
        continue;
      }
      next[key] = {
        promptPer1K: prompt,
        completionPer1K: completion,
      };
    }
    return next;
  } catch {
    return {};
  }
}

export function writePricingOverrides(overrides: PricingOverrideMap): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(PRICING_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new CustomEvent(PRICING_OVERRIDES_UPDATED_EVENT));
  } catch {
    // Ignore storage write failures.
  }
}

export function upsertPricingOverrides(entries: PricingOverrideMap): void {
  const current = readPricingOverrides();
  writePricingOverrides({
    ...current,
    ...entries,
  });
}

export function getRuntimePricingModels(
  baseModels: PricingConfig['models'],
): PricingConfig['models'] {
  const overrides = readPricingOverrides();
  if (Object.keys(overrides).length === 0) {
    return baseModels;
  }
  return {
    ...baseModels,
    ...overrides,
  };
}
