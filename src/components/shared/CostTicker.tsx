import { useId } from 'react';

import pricingConfigRaw from '@/config/model-pricing.json';
import type { LLMRole } from '@/types/llm';
import type { PricingConfig } from '@/types/pricing';

const pricingConfig = pricingConfigRaw as PricingConfig;
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const preciseCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const numberFormatter = new Intl.NumberFormat('en-US');
const COMPACT_VISIBLE_MIN_COST = 0.01;
const PRECISE_VISIBLE_MIN_COST = 0.0001;

export type CostModelBreakdown = {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  unknown?: boolean;
};

export type CostRoleBreakdown = {
  role: LLMRole;
  cost: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  models: CostModelBreakdown[];
};

type CostTickerProps = {
  totalCost: number;
  roles: CostRoleBreakdown[];
  lastUpdated?: string;
  hasUnknownModel?: boolean;
  className?: string;
};

const roleLabels: Record<LLMRole, string> = {
  chat: 'Chat AI',
  builder: 'Builder AI',
  critic: 'Web Designer AI',
  imaging: 'Imaging AI',
};

function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return currencyFormatter.format(0);
  if (value < COMPACT_VISIBLE_MIN_COST) return '<$0.01';
  return currencyFormatter.format(value);
}

function formatUsdPrecise(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return currencyFormatter.format(0);
  if (value < PRECISE_VISIBLE_MIN_COST) return '<$0.0001';
  if (value < COMPACT_VISIBLE_MIN_COST) return preciseCurrencyFormatter.format(value);
  return currencyFormatter.format(value);
}

function formatTokens(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return numberFormatter.format(Math.round(value));
}

function sumByRole(
  roles: CostRoleBreakdown[],
  key: 'promptTokens' | 'completionTokens' | 'calls',
): number {
  return roles.reduce((total, role) => total + role[key], 0);
}

export function CostTicker({
  totalCost,
  roles,
  lastUpdated,
  hasUnknownModel,
  className,
}: CostTickerProps) {
  const tooltipId = useId();
  const containerClass = ['group relative', className].filter(Boolean).join(' ');
  const unknown =
    hasUnknownModel ??
    roles.some((role) => role.models.some((model) => model.unknown));
  const totalPromptTokens = sumByRole(roles, 'promptTokens');
  const totalCompletionTokens = sumByRole(roles, 'completionTokens');
  const totalCalls = sumByRole(roles, 'calls');
  const pricingStamp = lastUpdated ?? pricingConfig.lastUpdated;

  return (
    <div className={containerClass}>
      <button
        type="button"
        aria-describedby={tooltipId}
        className="flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/70 px-3 py-1 font-['JetBrains_Mono'] text-xs font-medium uppercase tracking-[0.2em] text-slate-300 transition hover:border-emerald-300/60 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-200/70"
      >
        <span aria-hidden="true" className="text-sm">
          💰
        </span>
        <span>
          {formatUsdCompact(totalCost)}
          {unknown ? '*' : ''}
        </span>
        {unknown ? (
          <span className="sr-only">
            Some costs could not be calculated — unknown model pricing.
          </span>
        ) : null}
      </button>

      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-50 mt-3 w-[320px] translate-y-2 rounded-2xl border border-slate-800/80 bg-slate-950/95 p-4 text-left text-xs text-slate-200 opacity-0 shadow-[0_25px_60px_rgba(0,0,0,0.45)] backdrop-blur transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.28em] text-slate-400">
            Session Cost
          </div>
          <div className="text-sm font-semibold text-slate-100">
            {formatUsdPrecise(totalCost)}
            {unknown ? '*' : ''}
          </div>
        </div>

        {roles.length === 0 ? (
          <div className="mt-3 text-xs text-slate-400">No LLM usage yet.</div>
        ) : (
          <div className="mt-3 space-y-3">
            {roles.map((role) => (
              <div key={role.role} className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.24em] text-slate-400">
                    {roleLabels[role.role]}
                  </span>
                  <span className="text-xs font-semibold text-slate-100">
                    {formatUsdPrecise(role.cost)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {formatTokens(role.calls)} calls · {formatTokens(role.promptTokens)} in /{' '}
                  {formatTokens(role.completionTokens)} out
                </div>
                <div className="flex flex-wrap gap-2">
                  {role.models.map((model) => (
                    <span
                      key={`${role.role}-${model.model}`}
                      className="rounded-full border border-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400"
                    >
                      {model.model}
                      {model.unknown ? '*' : ''} · {formatTokens(model.calls)}x
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 space-y-1 border-t border-slate-800/80 pt-3 text-[11px] text-slate-400">
          <div>
            Tokens: {formatTokens(totalPromptTokens)} in / {formatTokens(totalCompletionTokens)} out
          </div>
          <div>Calls: {formatTokens(totalCalls)}</div>
          <div>Pricing updated: {pricingStamp}</div>
          {unknown ? (
            <div className="text-[11px] text-amber-200">
              Some costs could not be calculated — unknown model pricing.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
