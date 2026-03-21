import { useMemo, useState } from 'react';

import { useMediaStore } from '@/store/media-store';
import type { ImageryAssetRecord } from '@/types/imagery';

type MediaPanelProps = {
  label: string;
  sessionId: string;
  onReplaceSource: (oldSource: string, nextSource: string) => void;
};

export function MediaPanel({ label, sessionId, onReplaceSource }: MediaPanelProps) {
  const assets = useMediaStore((state) => state.assets);
  const [draftBySource, setDraftBySource] = useState<Record<string, string>>({});
  const sessionAssets = useMemo(
    () =>
      assets.filter((asset) => !asset.sessionId || asset.sessionId === sessionId),
    [assets, sessionId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="font-['JetBrains_Mono'] text-lg font-bold uppercase tracking-[0.22em] text-slate-100">
          {label}
        </h2>
        <span className="rounded-full border border-slate-700/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
          {sessionAssets.length} assets
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-800/80 bg-slate-950/40 p-3">
        {sessionAssets.length === 0 ? (
          <p className="text-sm text-slate-400">
            No imagery assets captured yet for this session.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {sessionAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                value={draftBySource[asset.source] ?? ''}
                onChange={(value) => {
                  setDraftBySource((current) => ({
                    ...current,
                    [asset.source]: value,
                  }));
                }}
                onApply={() => {
                  const value = (draftBySource[asset.source] ?? '').trim();
                  if (!value) {
                    return;
                  }
                  onReplaceSource(asset.source, value);
                  setDraftBySource((current) => ({
                    ...current,
                    [asset.source]: '',
                  }));
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  value,
  onChange,
  onApply,
}: {
  asset: ImageryAssetRecord;
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <article className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full border border-sky-300/40 bg-sky-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-sky-200">
          {asset.provenance}
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
          {asset.width && asset.height ? `${asset.width}x${asset.height}` : 'size unknown'}
        </span>
      </div>
      <p className="break-all text-[11px] text-slate-300">{asset.source}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
        Slots: {asset.targetSlots.join(', ')}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Replace URL/data URI..."
          className="flex-1 rounded-lg border border-slate-700/80 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-300/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg border border-emerald-300/70 bg-emerald-300/90 px-2 py-1.5 text-[10px] uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-200"
        >
          Apply
        </button>
      </div>
    </article>
  );
}
