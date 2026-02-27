import { useEffect, useRef, useState } from 'react';

import { PreviewPanel } from '@/components/preview/PreviewPanel';
import { HeaderBar } from '@/components/shared/HeaderBar';
import type { ChatMessage } from '@/types/chat';
import { groupChatMessages, type GroupPosition } from '@/utils/chatGrouping';

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

const sampleSessionId = 'session-demo';
const baseTimestamp = new Date('2025-02-01T18:30:00Z').getTime();

const sampleMessages: ChatMessage[] = [
  {
    id: 'm1',
    sessionId: sampleSessionId,
    timestamp: baseTimestamp,
    sender: 'user',
    content: 'We need a launch page for a ceramics studio in Portland.',
  },
  {
    id: 'm2',
    sessionId: sampleSessionId,
    timestamp: baseTimestamp + 45_000,
    sender: 'user',
    content: 'Lean on warm neutrals and show upcoming classes.',
  },
  {
    id: 'm3',
    sessionId: sampleSessionId,
    timestamp: baseTimestamp + 120_000,
    sender: 'chat_ai',
    content: 'Got it. Building a calm, tactile layout with classes up front.',
  },
  {
    id: 'm4',
    sessionId: sampleSessionId,
    timestamp: baseTimestamp + 165_000,
    sender: 'chat_ai',
    content: 'Do you want a waitlist form or direct booking buttons?',
  },
  {
    id: 'm5',
    sessionId: sampleSessionId,
    timestamp: baseTimestamp + 240_000,
    sender: 'user',
    content: 'Add a waitlist form for now. We will add booking later.',
  },
  {
    id: 'm6',
    sessionId: sampleSessionId,
    timestamp: baseTimestamp + 360_000,
    sender: 'system',
    content: 'Preview build queued. ETA 24 seconds.',
  },
];

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

const userBubbleShape: Record<GroupPosition, string> = {
  single: 'rounded-2xl',
  start: 'rounded-2xl rounded-br-md',
  middle: 'rounded-2xl rounded-tr-md rounded-br-md',
  end: 'rounded-2xl rounded-tr-md',
};

const assistantBubbleShape: Record<GroupPosition, string> = {
  single: 'rounded-2xl',
  start: 'rounded-2xl rounded-bl-md',
  middle: 'rounded-2xl rounded-tl-md rounded-bl-md',
  end: 'rounded-2xl rounded-tl-md',
};

function formatTimestamp(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

export function Layout() {
  const [activePanel, setActivePanel] = useState<PanelKey>('chat');
  const groupedMessages = groupChatMessages(sampleMessages);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isTyping = true;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    });
  }, [groupedMessages.length, isTyping]);

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
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <p className="text-sm text-slate-300">{panels[0].description}</p>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/50">
                <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3">
                  <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.3em] text-slate-400">
                    Live Conversation
                  </div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-300/90 shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
                    Active
                  </div>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="flex flex-col">
                    {groupedMessages.map((grouped, index) => {
                      const { message, position, showHeader } = grouped;
                      const isUser = message.sender === 'user';
                      const isSystem = message.sender === 'system';
                      const alignment = isSystem
                        ? 'items-center'
                        : isUser
                          ? 'items-end'
                          : 'items-start';
                      const bubbleShape = isSystem
                        ? 'rounded-xl'
                        : isUser
                          ? userBubbleShape[position]
                          : assistantBubbleShape[position];
                      const bubbleTone = isSystem
                        ? 'border border-slate-800/80 bg-slate-900/70 text-slate-200'
                        : isUser
                          ? 'bg-emerald-300 text-slate-950 shadow-[0_10px_20px_rgba(16,185,129,0.25)]'
                          : 'bg-slate-800/90 text-slate-100 shadow-[0_10px_20px_rgba(15,23,42,0.45)]';
                      const spacingClass =
                        index === 0 ? 'mt-0' : showHeader ? 'mt-4' : 'mt-1';
                      const maxWidth = isSystem ? 'max-w-[82%]' : 'max-w-[75%]';

                      return (
                        <div
                          key={message.id}
                          className={`flex flex-col ${alignment} ${spacingClass}`}
                        >
                          {showHeader && !isSystem && (
                            <div
                              className={`mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400 ${
                                isUser ? 'justify-end text-right' : 'justify-start'
                              }`}
                            >
                              <span className="font-['JetBrains_Mono']">
                                {isUser ? 'You' : 'Studio'}
                              </span>
                              <span className="text-slate-500">
                                {formatTimestamp(message.timestamp)}
                              </span>
                            </div>
                          )}
                          {isSystem && (
                            <div className="mb-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              System Notice
                            </div>
                          )}
                          <div
                            className={`${maxWidth} px-4 py-2 text-sm leading-relaxed ${bubbleTone} ${bubbleShape} whitespace-pre-line`}
                          >
                            {message.content}
                          </div>
                        </div>
                      );
                    })}
                    {isTyping && (
                      <div className="mt-4 flex flex-col items-start">
                        <div className="mb-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-400">
                          Studio
                        </div>
                        <div className="flex items-center gap-2 rounded-2xl bg-slate-800/90 px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.45)]">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="border-t border-slate-800/80 px-4 py-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-xs text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-300/80" />
                    Type your next instruction...
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="Preview panel"
            className={`${panelShell} ${
              activePanel === 'preview' ? 'block' : 'hidden'
            } md:block`}
          >
            <PreviewPanel
              kicker={panels[1].kicker}
              label={panels[1].label}
              description={panels[1].description}
            />
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
