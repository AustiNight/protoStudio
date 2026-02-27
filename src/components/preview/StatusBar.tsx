import { useEffect, useState } from 'react';

import { getStatusBarColor, getStatusBarText, type StatusBarColor } from '@/engine/chat/narration';
import { useBuildStore } from '@/store/build-store';
import type { BuildPhase } from '@/types/build';

const STATUS_STYLES: Record<StatusBarColor, { dot: string; pulse: boolean }> = {
  green: {
    dot: 'bg-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.6)]',
    pulse: true,
  },
  amber: {
    dot: 'bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.6)]',
    pulse: true,
  },
  red: {
    dot: 'bg-rose-400 shadow-[0_0_10px_rgba(248,113,113,0.6)]',
    pulse: false,
  },
  gray: {
    dot: 'bg-slate-500',
    pulse: false,
  },
};

function formatElapsed(startedAt: number, phase: BuildPhase, now: number): string {
  if (phase === 'idle' || !Number.isFinite(startedAt) || startedAt <= 0) {
    return '--';
  }

  const elapsedMs = Math.max(0, now - startedAt);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${seconds}s`;
}

export function StatusBar() {
  const buildState = useBuildStore((state) => state.buildState);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (buildState.phase === 'idle') {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [buildState.phase]);

  const statusText = getStatusBarText(buildState);
  const statusColor = getStatusBarColor(buildState);
  const statusStyle = STATUS_STYLES[statusColor];
  const elapsedLabel = formatElapsed(buildState.startedAt, buildState.phase, now);
  const dotClass = `h-2.5 w-2.5 rounded-full ${statusStyle.dot} ${
    statusStyle.pulse ? 'animate-pulse' : ''
  }`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={dotClass} aria-hidden="true" />
        <div>
          <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.3em] text-slate-400">
            Build status
          </div>
          <div className="text-sm text-slate-200">{statusText}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
        <span>Elapsed</span>
        <span className="font-['JetBrains_Mono'] text-slate-200">{elapsedLabel}</span>
      </div>
    </div>
  );
}
