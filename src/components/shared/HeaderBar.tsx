import type { CostRoleBreakdown } from './CostTicker';
import { CostTicker } from './CostTicker';

type HeaderBarProps = {
  onOpenSettings?: () => void;
  onNewConversation?: () => void;
  isResetting?: boolean;
  costTotal?: number;
  costRoles?: CostRoleBreakdown[];
  hasUnknownModel?: boolean;
  pricingGapCount?: number;
};

export function HeaderBar({
  onOpenSettings,
  onNewConversation,
  isResetting = false,
  costTotal = 0,
  costRoles = [],
  hasUnknownModel,
  pricingGapCount = 0,
}: HeaderBarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300/90 via-cyan-300/80 to-sky-400/90 shadow-[0_0_20px_rgba(45,212,191,0.35)]">
            <div className="h-2.5 w-2.5 rounded-full bg-slate-950" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-100">
              prontoproto.studio
            </div>
            <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.24em] text-slate-400">
              Studio Shell
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-200">
          {pricingGapCount > 0 && (
            <button
              type="button"
              onClick={() => onOpenSettings?.()}
              className="hidden rounded-full border border-amber-300/70 bg-amber-300/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-300/30 sm:inline-flex"
              title="New OpenAI models are missing pricing metadata. Open Settings and create/update pricing PR."
            >
              Pricing Review {pricingGapCount}
            </button>
          )}
          <CostTicker
            className="hidden sm:flex"
            totalCost={costTotal}
            roles={costRoles}
            hasUnknownModel={hasUnknownModel}
          />
          <button
            type="button"
            onClick={() => onOpenSettings?.()}
            className="rounded-full border border-slate-800/80 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-emerald-300/60 hover:text-emerald-200"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => onNewConversation?.()}
            disabled={isResetting}
            className="rounded-full bg-emerald-300/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isResetting ? 'Resetting...' : 'New Conversation'}
          </button>
        </div>
      </div>
    </header>
  );
}
