import { useState } from 'react';

import { HeaderBar } from '@/components/shared/HeaderBar';

type PanelKey = 'chat' | 'preview' | 'backlog';

const panels: Array<{
  id: PanelKey;
  label: string;
  kicker: string;
  description: string;
}> = [
  {
    id: 'chat',
    label: 'Chat',
    kicker: 'Conversation',
    description: 'Speak in plain language. We translate it into a build plan.',
  },
  {
    id: 'preview',
    label: 'Preview',
    kicker: 'Live Canvas',
    description: 'Blue/green swaps land here with visual confirmation.',
  },
  {
    id: 'backlog',
    label: 'Backlog',
    kicker: 'On Deck',
    description: 'Work items line up, focus locks in, progress stays visible.',
  },
];

const panelShell =
  'relative flex h-full min-h-[420px] flex-col gap-4 rounded-3xl border border-slate-800/70 bg-slate-900/60 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur';

export function Layout() {
  const [activePanel, setActivePanel] = useState<PanelKey>('chat');

  return (
    <div className="relative min-h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_45%_at_10%_0%,rgba(16,185,129,0.28),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_40%_at_90%_10%,rgba(56,189,248,0.2),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_100%,rgba(15,23,42,0.9),transparent_60%)]" />
      <HeaderBar />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-[1800px] flex-col px-4 pb-6 pt-20">
        <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 md:hidden">
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              onClick={() => setActivePanel(panel.id)}
              aria-pressed={activePanel === panel.id}
              className={`flex-1 rounded-xl px-3 py-2 transition ${
                activePanel === panel.id
                  ? 'bg-emerald-300/90 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                  : 'text-slate-300 hover:text-emerald-200'
              }`}
            >
              {panel.label}
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,4.5fr)_minmax(0,2.5fr)]">
          <section
            aria-label="Chat panel"
            className={`${panelShell} ${
              activePanel === 'chat' ? 'block' : 'hidden'
            } md:block`}
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-400">
                  {panels[0].kicker}
                </p>
                <h2 className="text-xl font-semibold tracking-tight">{panels[0].label}</h2>
              </div>
              <span className="rounded-full border border-slate-800/80 px-3 py-1 font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] text-slate-300">
                Live
              </span>
            </header>
            <div className="flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm text-slate-300">{panels[0].description}</p>
              <div className="rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/40 p-4 font-['JetBrains_Mono'] text-xs uppercase tracking-[0.25em] text-slate-500">
                Message stream placeholder
              </div>
            </div>
          </section>

          <section
            aria-label="Preview panel"
            className={`${panelShell} ${
              activePanel === 'preview' ? 'block' : 'hidden'
            } md:block`}
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-400">
                  {panels[1].kicker}
                </p>
                <h2 className="text-xl font-semibold tracking-tight">{panels[1].label}</h2>
              </div>
              <span className="rounded-full border border-slate-800/80 px-3 py-1 font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] text-slate-300">
                Blue Slot
              </span>
            </header>
            <div className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-slate-300">{panels[1].description}</p>
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/40 via-slate-900/20 to-slate-950/70">
                <div className="font-['JetBrains_Mono'] text-center text-xs uppercase tracking-[0.3em] text-slate-500">
                  Preview iframe placeholder
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="Backlog panel"
            className={`${panelShell} ${
              activePanel === 'backlog' ? 'block' : 'hidden'
            } md:block`}
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-400">
                  {panels[2].kicker}
                </p>
                <h2 className="text-xl font-semibold tracking-tight">{panels[2].label}</h2>
              </div>
              <span className="rounded-full border border-slate-800/80 px-3 py-1 font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] text-slate-300">
                Locked
              </span>
            </header>
            <div className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-slate-300">{panels[2].description}</p>
              <div className="space-y-3">
                {['On Deck', 'In Progress', 'Queued'].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-800/80 bg-slate-900/50 px-4 py-3"
                  >
                    <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] text-slate-400">
                      {item}
                    </div>
                    <div className="mt-2 h-2 w-4/5 rounded-full bg-slate-800" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
