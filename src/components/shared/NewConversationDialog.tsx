import { useEffect } from 'react';

type NewConversationDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isWorking?: boolean;
};

export function NewConversationDialog({
  open,
  onCancel,
  onConfirm,
  isWorking = false,
}: NewConversationDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isWorking) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel, isWorking]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur"
        aria-hidden="true"
        onClick={() => {
          if (!isWorking) {
            onCancel();
          }
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-conversation-title"
        aria-describedby="new-conversation-description"
        className="relative w-full max-w-xl rounded-3xl border border-slate-800/80 bg-slate-950/95 p-6 shadow-[0_30px_60px_rgba(15,23,42,0.55)]"
      >
        <div className="flex items-center justify-between">
          <h2
            id="new-conversation-title"
            className="text-2xl font-semibold tracking-tight text-slate-100"
          >
            Start a new conversation?
          </h2>
          <span className="rounded-full border border-slate-800/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Reset
          </span>
        </div>
        <p
          id="new-conversation-description"
          className="mt-3 text-sm text-slate-300"
        >
          This clears the active session, backlog, and preview state, but keeps your
          saved keys, models, and deploy tokens.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isWorking}
            className="rounded-full border border-slate-800/80 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-slate-600/80 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isWorking}
            className="rounded-full bg-emerald-300/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWorking ? 'Resetting...' : 'Start fresh'}
          </button>
        </div>
      </div>
    </div>
  );
}
