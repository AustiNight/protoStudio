import { useEffect, useRef, useState } from 'react';

import { PreviewPanel } from '@/components/preview/PreviewPanel';
import type { CostRoleBreakdown } from '@/components/shared/CostTicker';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { SettingsModal } from '@/components/shared/SettingsModal';
import type { ChatMessage } from '@/types/chat';
import { groupChatMessages, type GroupPosition } from '@/utils/chatGrouping';

type PanelKey = 'chat' | 'preview' | 'backlog';

type BacklogKind = 'Content' | 'Style' | 'Structure' | 'Behavior';
type BacklogImpact = 'Low' | 'Medium' | 'High';
type BacklogEffort = 'S' | 'M' | 'L';

type BacklogCard = {
  id: string;
  title: string;
  summary: string;
  kind: BacklogKind;
  impact: BacklogImpact;
  effort: BacklogEffort;
  owner: string;
};

type OnDeckCard = BacklogCard & {
  etaMinutes: number;
  visibleChange: string;
};

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
const onDeckItem: OnDeckCard = {
  id: 'deck-hero-cta',
  title: 'Refine hero CTA and add class callout',
  summary: 'Tighten the hero copy and add a subtle waitlist badge.',
  kind: 'Content',
  impact: 'High',
  effort: 'S',
  owner: 'PO',
  etaMinutes: 12,
  visibleChange: 'Hero CTA + waitlist badge',
};
const initialBacklogItems: BacklogCard[] = [
  {
    id: 'bk-1',
    title: 'Add class schedule section',
    summary: 'List upcoming pottery classes with dates and seats.',
    kind: 'Structure',
    impact: 'High',
    effort: 'M',
    owner: 'Builder',
  },
  {
    id: 'bk-2',
    title: 'Warm neutral palette refresh',
    summary: 'Shift backgrounds to clay and sandstone tones.',
    kind: 'Style',
    impact: 'Medium',
    effort: 'S',
    owner: 'Design',
  },
  {
    id: 'bk-3',
    title: 'Testimonials carousel',
    summary: 'Add 3 customer quotes with subtle motion.',
    kind: 'Behavior',
    impact: 'Medium',
    effort: 'M',
    owner: 'Builder',
  },
  {
    id: 'bk-4',
    title: 'Studio location micro-copy',
    summary: 'Clarify parking and transit options in the footer.',
    kind: 'Content',
    impact: 'Low',
    effort: 'S',
    owner: 'PO',
  },
];

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

const sampleCostRoles: CostRoleBreakdown[] = [
  {
    role: 'chat',
    cost: 0.18,
    calls: 14,
    promptTokens: 2400,
    completionTokens: 800,
    models: [
      {
        model: 'gpt-4o-mini',
        calls: 12,
        promptTokens: 2000,
        completionTokens: 700,
        cost: 0.15,
      },
      {
        model: 'gpt-4o',
        calls: 2,
        promptTokens: 400,
        completionTokens: 100,
        cost: 0.03,
      },
    ],
  },
  {
    role: 'builder',
    cost: 0.24,
    calls: 6,
    promptTokens: 1200,
    completionTokens: 600,
    models: [
      {
        model: 'claude-sonnet-4-20250514',
        calls: 6,
        promptTokens: 1200,
        completionTokens: 600,
        cost: 0.24,
      },
    ],
  },
];

const sampleCostTotal = sampleCostRoles.reduce((total, role) => total + role.cost, 0);
const sampleHasUnknownModel = sampleCostRoles.some((role) =>
  role.models.some((model) => model.unknown),
);

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

function reorderBacklog(
  items: BacklogCard[],
  fromIndex: number,
  toIndex: number,
): BacklogCard[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function emitBacklogReorder(fromId: string, toId: string, order: string[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('backlog:reorder', {
      detail: { fromId, toId, order },
    }),
  );
}

export function Layout() {
  const [activePanel, setActivePanel] = useState<PanelKey>('chat');
  const groupedMessages = groupChatMessages(sampleMessages);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isTyping = true;
  const [isPaused, setIsPaused] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(onDeckItem.id);
  const [backlogItems, setBacklogItems] = useState<BacklogCard[]>(initialBacklogItems);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
      <HeaderBar
        onOpenSettings={() => setIsSettingsOpen(true)}
        costTotal={sampleCostTotal}
        costRoles={sampleCostRoles}
        hasUnknownModel={sampleHasUnknownModel}
      />
      <SettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

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
              <div className="flex items-center gap-2">
                {isPaused && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-amber-200">
                    Paused
                  </span>
                )}
                <span className="rounded-full border border-slate-800/80 px-3 py-1 font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] text-slate-300">
                  Locked
                </span>
                <button
                  type="button"
                  onClick={() => setIsPaused((prev) => !prev)}
                  className="rounded-full border border-slate-800/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300 transition hover:border-emerald-300/70 hover:text-emerald-200"
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <p className="text-sm text-slate-300">{panels[2].description}</p>
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div
                  className={`rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/70 to-slate-950/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.45)] ${
                    focusedItemId === onDeckItem.id
                      ? 'ring-2 ring-emerald-300/70'
                      : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFocusedItemId(onDeckItem.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setFocusedItemId(onDeckItem.id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-400">
                      On Deck
                    </div>
                    <div className="flex items-center gap-2">
                      {focusedItemId === onDeckItem.id && (
                        <span className="rounded-full bg-emerald-300/20 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                          Focused
                        </span>
                      )}
                      <span className="rounded-full border border-slate-700/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                        Locked
                      </span>
                    </div>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-slate-100">
                    {onDeckItem.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">{onDeckItem.summary}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    <span className="rounded-full border border-slate-800/80 px-2 py-1">
                      {onDeckItem.kind}
                    </span>
                    <span className="rounded-full border border-slate-800/80 px-2 py-1">
                      Impact {onDeckItem.impact}
                    </span>
                    <span className="rounded-full border border-slate-800/80 px-2 py-1">
                      Effort {onDeckItem.effort}
                    </span>
                    <span className="rounded-full border border-slate-800/80 px-2 py-1">
                      ETA {onDeckItem.etaMinutes}m
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-['JetBrains_Mono'] uppercase tracking-[0.2em]">
                      Visible
                    </span>
                    <span className="text-slate-200">{onDeckItem.visibleChange}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-400">
                    Backlog Queue
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    Drag to reorder
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div
                    role="list"
                    className={`flex flex-col gap-3 ${
                      isPaused ? 'opacity-70' : ''
                    }`}
                  >
                    {backlogItems.map((item, index) => {
                      const isFocused = focusedItemId === item.id;
                      const isDragTarget = dragOverId === item.id;
                      return (
                        <div
                          key={item.id}
                          role="listitem"
                          tabIndex={0}
                          draggable={!isPaused}
                          aria-grabbed={draggedId === item.id}
                          onClick={() => setFocusedItemId(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setFocusedItemId(item.id);
                            }
                          }}
                          onDragStart={(event) => {
                            if (isPaused) return;
                            setDraggedId(item.id);
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', item.id);
                          }}
                          onDragOver={(event) => {
                            if (isPaused || !draggedId || draggedId === item.id) return;
                            event.preventDefault();
                            setDragOverId(item.id);
                            event.dataTransfer.dropEffect = 'move';
                          }}
                          onDragLeave={() => {
                            if (dragOverId === item.id) {
                              setDragOverId(null);
                            }
                          }}
                          onDrop={(event) => {
                            if (isPaused || !draggedId || draggedId === item.id) return;
                            event.preventDefault();
                            const fromIndex = backlogItems.findIndex(
                              (candidate) => candidate.id === draggedId,
                            );
                            const toIndex = backlogItems.findIndex(
                              (candidate) => candidate.id === item.id,
                            );
                            if (fromIndex < 0 || toIndex < 0) return;
                            const reordered = reorderBacklog(backlogItems, fromIndex, toIndex);
                            setBacklogItems(reordered);
                            emitBacklogReorder(
                              draggedId,
                              item.id,
                              reordered.map((entry) => entry.id),
                            );
                            setDraggedId(null);
                            setDragOverId(null);
                          }}
                          onDragEnd={() => {
                            setDraggedId(null);
                            setDragOverId(null);
                          }}
                          className={`rounded-2xl border border-slate-800/80 bg-slate-900/60 px-4 py-3 transition ${
                            isFocused ? 'ring-2 ring-emerald-300/60' : ''
                          } ${isDragTarget ? 'border-emerald-300/70' : ''} ${
                            isPaused ? 'cursor-not-allowed' : 'cursor-grab'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                  {item.owner}
                                </span>
                                {isFocused && (
                                  <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                                    Focused
                                  </span>
                                )}
                              </div>
                              <h4 className="mt-2 text-sm font-semibold text-slate-100">
                                {item.title}
                              </h4>
                              <p className="mt-1 text-xs text-slate-300">
                                {item.summary}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                              <span className="rounded-full border border-slate-800/80 px-2 py-1">
                                {item.kind}
                              </span>
                              <span className="rounded-full border border-slate-800/80 px-2 py-1">
                                Impact {item.impact}
                              </span>
                              <span className="rounded-full border border-slate-800/80 px-2 py-1">
                                Effort {item.effort}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            <span>Priority {index + 1}</span>
                            <span>{isPaused ? 'Paused' : 'Drag ready'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
