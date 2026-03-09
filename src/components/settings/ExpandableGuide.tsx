import { useState } from 'react';

export interface ExpandableGuideProps {
  title: string;
  steps: string[];
  urls?: string[];
  securityNotes?: string[];
  lastVerified?: string;
}

export function ExpandableGuide({
  title,
  steps,
  urls = [],
  securityNotes = [],
  lastVerified,
}: ExpandableGuideProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-slate-100">{title}</span>
        <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-400">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-xs">
          <div>
            <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Steps
            </div>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-slate-300">
              {steps.map((step, index) => (
                <li key={`${title}-step-${index}`}>{step}</li>
              ))}
            </ol>
          </div>
          {urls.length > 0 && (
            <div>
              <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Links
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-300">
                {urls.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-200 hover:text-emerald-100"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {securityNotes.length > 0 && (
            <div>
              <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Security Notes
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-300">
                {securityNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          {lastVerified && (
            <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Last verified {lastVerified}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
