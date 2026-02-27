import { useEffect, useMemo } from 'react';

import type { RecoveryState } from '@/types/persistence';

type SessionRecoveryDialogProps = {
  open: boolean;
  recovery: RecoveryState | null;
  onResume: () => void;
  onStartFresh: () => void;
  isWorking?: boolean;
};

export function SessionRecoveryDialog({
  open,
  recovery,
  onResume,
  onStartFresh,
  isWorking = false,
}: SessionRecoveryDialogProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [],
  );

  if (!open || !recovery) return null;

  const backlogLabel = recovery.backlogRemaining === 1 ? 'item' : 'items';
  const lastSavedLabel = formatter.format(new Date(recovery.lastSavedAt));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-recovery-title"
        aria-describedby="session-recovery-description"
        className="relative w-full max-w-xl rounded-3xl border border-slate-800/80 bg-slate-950/95 p-6 shadow-[0_30px_60px_rgba(15,23,42,0.55)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="session-recovery-title"
            className="text-2xl font-semibold tracking-tight text-slate-100"
          >
            Resume your session?
          </h2>
          <span className="rounded-full border border-slate-800/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Recovery
          </span>
        </div>
        <p
          id="session-recovery-description"
          className="mt-3 text-sm text-slate-300"
        >
          We found an unfinished session saved on {lastSavedLabel}. Your site was
          at VFS version {recovery.vfsVersion} with {recovery.backlogRemaining}{' '}
          backlog {backlogLabel} remaining.
        </p>
        <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-900/70 px-4 py-3 text-xs text-slate-300">
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] uppercase tracking-[0.2em] text-slate-500">
              Session
            </span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-slate-200">
              {recovery.sessionId}
            </span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onStartFresh}
            disabled={isWorking}
            className="rounded-full border border-slate-800/80 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-slate-600/80 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start fresh
          </button>
          <button
            type="button"
            onClick={onResume}
            disabled={isWorking}
            className="rounded-full bg-emerald-300/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWorking ? 'Resuming...' : 'Resume session'}
          </button>
        </div>
      </div>
    </div>
  );
}
