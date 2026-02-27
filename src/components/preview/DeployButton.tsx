import type { MouseEvent } from 'react';

type DeployButtonProps = {
  disabled: boolean;
  isDeploying?: boolean;
  hasDeployed?: boolean;
  hasError?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabledReason?: string;
};

export function DeployButton({
  disabled,
  isDeploying = false,
  hasDeployed = false,
  hasError = false,
  onClick,
  disabledReason,
}: DeployButtonProps) {
  const label = isDeploying
    ? 'Deploying'
    : hasDeployed
      ? 'Redeploy'
      : hasError
        ? 'Retry Deploy'
        : 'Deploy';

  const isLocked = disabled || isDeploying;

  const toneClass = isLocked
    ? 'bg-slate-800/70 text-slate-400'
    : hasError
      ? 'bg-rose-400/90 text-slate-950'
      : hasDeployed
        ? 'bg-emerald-300/90 text-slate-950'
        : 'bg-sky-400/90 text-slate-950';

  const hoverClass = isLocked
    ? ''
    : hasError
      ? 'hover:bg-rose-300'
      : hasDeployed
        ? 'hover:bg-emerald-200'
        : 'hover:bg-sky-300';

  const title = isDeploying
    ? 'Deployment in progress.'
    : disabled
      ? disabledReason ?? 'Deployment unavailable.'
      : hasDeployed
        ? 'Deploy again to update the live site.'
        : 'Publish the current preview.';

  return (
    <button
      type="button"
      onClick={(event) => {
        if (isLocked) return;
        onClick?.(event);
      }}
      disabled={isLocked}
      aria-busy={isDeploying}
      title={title}
      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition ${toneClass} ${hoverClass} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {label}
    </button>
  );
}
