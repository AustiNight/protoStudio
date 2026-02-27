import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resetChlorastroliteSession } from '@/components/preview/ChlorastroliteLoader';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import type { CostRoleBreakdown } from '@/components/shared/CostTicker';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { NewConversationDialog } from '@/components/shared/NewConversationDialog';
import { SessionRecoveryDialog } from '@/components/shared/SessionRecoveryDialog';
import { SettingsModal } from '@/components/shared/SettingsModal';
import {
  getErrorChatMessage,
  getSkipChatMessage,
  getSwapChatMessage,
} from '@/engine/chat/narration';
import { evaluateReorder } from '@/engine/chat/po-logic';
import { SessionCheckpoint } from '@/persistence/checkpoint';
import { useBacklogStore } from '@/store/backlog-store';
import { useBuildStore } from '@/store/build-store';
import { useChatStore } from '@/store/chat-store';
import type { ChatMessage } from '@/types/chat';
import type { AtomType, Effort, WorkItem, WorkItemStatus } from '@/types/backlog';
import type { BuildPhase } from '@/types/build';
import type { RecoveryState } from '@/types/persistence';
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

type NarrationCheckpoint = {
  phase: BuildPhase;
  atomId: string | null;
  lastError: string | null;
};

type PendingReorder = {
  fromId: string;
  toId: string;
  originalOrder: string[];
  nextOrder: string[];
};

let messageCounter = 0;

function buildNarrationMessage(
  sessionId: string,
  sender: ChatMessage['sender'],
  content: string,
  backlogItemId?: string | null,
): ChatMessage {
  const timestamp = Date.now();
  messageCounter += 1;
  return {
    id: `msg-${timestamp}-${messageCounter}`,
    sessionId,
    timestamp,
    sender,
    content,
    metadata: backlogItemId ? { backlogItemId } : undefined,
  };
}

function reorderArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) {
    return next;
  }
  next.splice(toIndex, 0, moved);
  return next;
}

function applyQueueOrder(items: WorkItem[], queueOrder: string[]): WorkItem[] {
  if (queueOrder.length === 0) {
    return items.map((item, index) => ({ ...item, order: index + 1 }));
  }

  const queueSet = new Set(queueOrder);
  const queueItems = items.filter((item) => queueSet.has(item.id));
  if (queueItems.length === 0) {
    return items.map((item, index) => ({ ...item, order: index + 1 }));
  }

  const queueById = new Map(queueItems.map((item) => [item.id, item]));
  const used = new Set<string>();
  const orderedQueue: WorkItem[] = [];

  for (const id of queueOrder) {
    const item = queueById.get(id);
    if (!item || used.has(id)) {
      continue;
    }
    orderedQueue.push(item);
    used.add(id);
  }

  for (const item of queueItems) {
    if (!used.has(item.id)) {
      orderedQueue.push(item);
    }
  }

  let queueIndex = 0;
  const nextItems = items.map((item) => {
    if (!queueSet.has(item.id)) {
      return item;
    }
    const replacement = orderedQueue[queueIndex] ?? item;
    queueIndex += 1;
    return replacement;
  });

  return nextItems.map((item, index) => ({ ...item, order: index + 1 }));
}

function pickNextBacklogItem(items: WorkItem[], excludeId: string | null): WorkItem | null {
  let next: WorkItem | null = null;
  for (const item of items) {
    if (item.status !== 'backlog') {
      continue;
    }
    if (excludeId && item.id === excludeId) {
      continue;
    }
    if (!next || item.order < next.order) {
      next = item;
    }
  }
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
  const [activeSessionId, setActiveSessionId] = useState(sampleSessionId);
  const [recoveryState, setRecoveryState] = useState<RecoveryState | null>(null);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const messages = useChatStore((state) => state.messages);
  const addMessage = useChatStore((state) => state.addMessage);
  const setMessages = useChatStore((state) => state.setMessages);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const groupedMessages = groupChatMessages(messages);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seededMessagesRef = useRef(false);
  const narrationRef = useRef<NarrationCheckpoint | null>(null);
  const isTyping = messages.length > 0;
  const backlogItems = useBacklogStore((state) => state.items);
  const onDeckItem = useBacklogStore((state) =>
    state.onDeckId ? state.items.find((item) => item.id === state.onDeckId) ?? null : null,
  );
  const focusedItemId = useBacklogStore((state) => state.focusedItemId);
  const focusItem = useBacklogStore((state) => state.focusItem);
  const promoteNext = useBacklogStore((state) => state.promoteNext);
  const setBacklogItems = useBacklogStore((state) => state.setItems);
  const updateBacklogItem = useBacklogStore((state) => state.updateItem);
  const moveBacklogItemToEnd = useBacklogStore((state) => state.moveToEnd);
  const clearBacklog = useBacklogStore((state) => state.clearBacklog);
  const isPaused = useBuildStore((state) => state.isPaused);
  const buildPhase = useBuildStore((state) => state.buildState.phase);
  const buildAtom = useBuildStore((state) => state.buildState.currentAtom);
  const buildError = useBuildStore((state) => state.buildState.lastError);
  const togglePause = useBuildStore((state) => state.togglePause);
  const resetBuild = useBuildStore((state) => state.resetBuild);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [pendingReorder, setPendingReorder] = useState<PendingReorder | null>(null);
  const [queueOrderOverride, setQueueOrderOverride] = useState<string[] | null>(null);
  const [revertPulse, setRevertPulse] = useState(false);
  const [deniedItemId, setDeniedItemId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [previewResetKey, setPreviewResetKey] = useState(0);
  const [autoFocusOnDeck, setAutoFocusOnDeck] = useState(true);
  const revertTimerRef = useRef<number | null>(null);
  const deniedTimerRef = useRef<number | null>(null);
  const isReorderPending = pendingReorder !== null;

  const triggerRevertPulse = () => {
    if (revertTimerRef.current) {
      window.clearTimeout(revertTimerRef.current);
    }
    setRevertPulse(true);
    revertTimerRef.current = window.setTimeout(() => {
      setRevertPulse(false);
      revertTimerRef.current = null;
    }, 360);
  };

  const triggerDeniedHighlight = (itemId: string) => {
    if (deniedTimerRef.current) {
      window.clearTimeout(deniedTimerRef.current);
    }
    setDeniedItemId(itemId);
    deniedTimerRef.current = window.setTimeout(() => {
      setDeniedItemId(null);
      deniedTimerRef.current = null;
    }, 1200);
  };

  const addFocusedMessage = useCallback(
    (message: ChatMessage) => {
      if (focusedItemId && !message.metadata?.backlogItemId) {
        addMessage({
          ...message,
          metadata: {
            ...message.metadata,
            backlogItemId: focusedItemId,
          },
        });
        return;
      }
      addMessage(message);
    },
    [addMessage, focusedItemId],
  );

  const handleFocusToggle = useCallback(
    (itemId: string) => {
      if (focusedItemId === itemId) {
        focusItem(null);
        setAutoFocusOnDeck(false);
        return;
      }
      focusItem(itemId);
      setAutoFocusOnDeck(true);
    },
    [focusItem, focusedItemId],
  );

  useEffect(() => {
    let isMounted = true;
    const checkpoint = new SessionCheckpoint();

    void (async () => {
      const detectResult = await checkpoint.detectRecovery();
      if (!isMounted) {
        return;
      }
      if (detectResult.ok && detectResult.value) {
        setRecoveryState(detectResult.value);
        setIsRecoveryOpen(true);
      }
      setRecoveryChecked(true);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (revertTimerRef.current) {
        window.clearTimeout(revertTimerRef.current);
      }
      if (deniedTimerRef.current) {
        window.clearTimeout(deniedTimerRef.current);
      }
    };
  }, []);

  const queueItems = useMemo(() => {
    const baseQueue = [...backlogItems]
      .filter((item) => item.status !== 'done' && item.id !== onDeckItem?.id)
      .sort((a, b) => a.order - b.order);

    if (!queueOrderOverride || queueOrderOverride.length === 0) {
      return baseQueue;
    }

    const byId = new Map(baseQueue.map((item) => [item.id, item]));
    const used = new Set<string>();
    const ordered: WorkItem[] = [];

    for (const id of queueOrderOverride) {
      const item = byId.get(id);
      if (!item || used.has(id)) {
        continue;
      }
      ordered.push(item);
      used.add(id);
    }

    for (const item of baseQueue) {
      if (!used.has(item.id)) {
        ordered.push(item);
      }
    }

    return ordered;
  }, [backlogItems, onDeckItem?.id, queueOrderOverride]);
  const completedItems = useMemo(
    () => backlogItems.filter((item) => item.status === 'done'),
    [backlogItems],
  );
  const hasBacklog = useMemo(
    () => backlogItems.some((item) => item.status === 'backlog'),
    [backlogItems],
  );
  const focusedItem = useMemo(() => {
    if (!focusedItemId) {
      return null;
    }
    return backlogItems.find((item) => item.id === focusedItemId) ?? null;
  }, [backlogItems, focusedItemId]);
  const hasFocusedItem = focusedItem !== null;

  useEffect(() => {
    if (!onDeckItem && hasBacklog) {
      promoteNext();
    }
  }, [hasBacklog, onDeckItem, promoteNext]);

  useEffect(() => {
    if (onDeckItem?.status === 'done') {
      promoteNext();
    }
  }, [onDeckItem?.status, promoteNext]);

  useEffect(() => {
    if (!buildAtom) {
      return;
    }
    const current = backlogItems.find((item) => item.id === buildAtom.id);
    if (!current) {
      return;
    }

    if (buildPhase === 'error') {
      if (current.status !== 'blocked') {
        updateBacklogItem(current.id, { status: 'blocked' });
      }
      return;
    }

    if (buildPhase === 'skipping') {
      if (current.status !== 'backlog') {
        updateBacklogItem(current.id, { status: 'backlog' });
      }
      if (backlogItems[backlogItems.length - 1]?.id !== current.id) {
        moveBacklogItemToEnd(current.id);
      }
      if (onDeckItem?.id === current.id) {
        promoteNext();
      }
      return;
    }

    if (buildPhase === 'swapping') {
      if (current.status !== 'done') {
        updateBacklogItem(current.id, { status: 'done' });
      }
      return;
    }

    if (buildPhase !== 'idle' && current.status !== 'in_progress') {
      updateBacklogItem(current.id, { status: 'in_progress' });
    }
  }, [
    backlogItems,
    buildAtom,
    buildPhase,
    moveBacklogItemToEnd,
    onDeckItem?.id,
    promoteNext,
    updateBacklogItem,
  ]);

  useEffect(() => {
    if (onDeckItem && (!focusedItemId || !hasFocusedItem) && autoFocusOnDeck) {
      focusItem(onDeckItem.id);
    }
  }, [autoFocusOnDeck, focusItem, focusedItemId, hasFocusedItem, onDeckItem]);

  useEffect(() => {
    if (seededMessagesRef.current) {
      return;
    }
    if (!recoveryChecked) {
      return;
    }
    if (recoveryState) {
      return;
    }
    seededMessagesRef.current = true;
    if (messages.length === 0) {
      setMessages(sampleMessages);
    }
  }, [messages.length, recoveryChecked, recoveryState, setMessages]);

  useEffect(() => {
    const atomId = buildAtom?.id ?? null;
    const lastCheckpoint = narrationRef.current;

    if (
      lastCheckpoint &&
      lastCheckpoint.phase === buildPhase &&
      lastCheckpoint.atomId === atomId &&
      lastCheckpoint.lastError === buildError
    ) {
      return;
    }

    if (buildPhase === 'swapping' && buildAtom) {
      addFocusedMessage(
        buildNarrationMessage(
          activeSessionId,
          'chat_ai',
          getSwapChatMessage(buildAtom),
          buildAtom.id,
        ),
      );
    }

    if (buildPhase === 'skipping' && buildAtom) {
      const nextAtom =
        onDeckItem && onDeckItem.id !== buildAtom.id
          ? onDeckItem
          : pickNextBacklogItem(backlogItems, buildAtom.id);
      addFocusedMessage(
        buildNarrationMessage(
          activeSessionId,
          'chat_ai',
          getSkipChatMessage(buildAtom, nextAtom),
          buildAtom.id,
        ),
      );
    }

    if (buildPhase === 'error') {
      const errorMessage = buildError ?? 'Unexpected build error.';
      addFocusedMessage(
        buildNarrationMessage(
          activeSessionId,
          'chat_ai',
          getErrorChatMessage(errorMessage, ''),
          atomId,
        ),
      );
    }

    narrationRef.current = {
      phase: buildPhase,
      atomId,
      lastError: buildError,
    };
  }, [
    activeSessionId,
    addFocusedMessage,
    buildAtom,
    buildError,
    buildPhase,
    backlogItems,
    onDeckItem,
  ]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    });
  }, [groupedMessages.length, isTyping]);

  const handleStartNewConversation = () => {
    if (isResetting) return;
    setIsResetDialogOpen(true);
  };

  const resetTransientUi = () => {
    if (revertTimerRef.current) {
      window.clearTimeout(revertTimerRef.current);
      revertTimerRef.current = null;
    }
    if (deniedTimerRef.current) {
      window.clearTimeout(deniedTimerRef.current);
      deniedTimerRef.current = null;
    }
    setDraggedId(null);
    setDragOverId(null);
    setPendingReorder(null);
    setQueueOrderOverride(null);
    setDeniedItemId(null);
    setRevertPulse(false);
    setShowCompleted(false);
    setAutoFocusOnDeck(true);
    setActivePanel('chat');
  };

  const resetWorkspace = async () => {
    const checkpoint = new SessionCheckpoint();
    await checkpoint.clear();
    resetChlorastroliteSession();
    clearMessages();
    clearBacklog();
    resetBuild();
    resetTransientUi();
    setActiveSessionId(sampleSessionId);
    setPreviewResetKey((prev) => prev + 1);
    seededMessagesRef.current = true;
  };

  const handleConfirmReset = async () => {
    if (isResetting) return;
    setIsResetting(true);
    await resetWorkspace();
    setIsResetDialogOpen(false);
    setIsResetting(false);
  };

  const handleResumeRecovery = async () => {
    if (isRecoveryLoading) return;
    setIsRecoveryLoading(true);
    const checkpoint = new SessionCheckpoint();
    const loadResult = await checkpoint.load();

    if (!loadResult.ok || !loadResult.value) {
      await checkpoint.clear();
      setRecoveryState(null);
      setIsRecoveryOpen(false);
      setIsRecoveryLoading(false);
      setRecoveryChecked(true);
      seededMessagesRef.current = true;
      return;
    }

    const { session, backlog, conversation } = loadResult.value;
    setActiveSessionId(session.id);
    setMessages(conversation);
    setBacklogItems(backlog);
    resetBuild();
    resetTransientUi();
    setRecoveryState(null);
    setIsRecoveryOpen(false);
    setIsRecoveryLoading(false);
    setRecoveryChecked(true);
    seededMessagesRef.current = true;
  };

  const handleStartFreshRecovery = async () => {
    if (isRecoveryLoading) return;
    setIsRecoveryLoading(true);
    await resetWorkspace();
    setRecoveryState(null);
    setIsRecoveryOpen(false);
    setIsRecoveryLoading(false);
    setRecoveryChecked(true);
  };

  return (
    <div className="relative min-h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_45%_at_10%_0%,rgba(16,185,129,0.28),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_40%_at_90%_10%,rgba(56,189,248,0.2),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_100%,rgba(15,23,42,0.9),transparent_60%)]" />
      <HeaderBar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNewConversation={handleStartNewConversation}
        isResetting={isResetting}
        costTotal={sampleCostTotal}
        costRoles={sampleCostRoles}
        hasUnknownModel={sampleHasUnknownModel}
      />
      <SettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <SessionRecoveryDialog
        open={isRecoveryOpen}
        recovery={recoveryState}
        onResume={handleResumeRecovery}
        onStartFresh={handleStartFreshRecovery}
        isWorking={isRecoveryLoading}
      />
      <NewConversationDialog
        open={isResetDialogOpen}
        onCancel={() => setIsResetDialogOpen(false)}
        onConfirm={handleConfirmReset}
        isWorking={isResetting}
      />

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
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 px-4 py-2 text-[11px] text-slate-300">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.3em] text-emerald-200">
                      Focus
                    </span>
                    <span className="max-w-[220px] truncate font-medium text-slate-100">
                      {focusedItem ? focusedItem.title : 'General'}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {focusedItem
                      ? 'Click focused card again to clear.'
                      : 'Click a backlog card to focus.'}
                  </span>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="flex flex-col">
                    {groupedMessages.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-sm text-slate-400">
                        <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.3em] text-slate-500">
                          New session
                        </div>
                        <div>Describe the site you want to build to start a new preview.</div>
                      </div>
                    ) : (
                      groupedMessages.map((grouped, index) => {
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
                      })
                    )}
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
                    {focusedItem
                      ? `Ask about ${focusedItem.title}...`
                      : 'Type your next instruction...'}
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
              key={previewResetKey}
              kicker={panels[1].kicker}
              label={panels[1].label}
              description={panels[1].description}
              sessionId={activeSessionId}
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
                  onClick={togglePause}
                  className="rounded-full border border-slate-800/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300 transition hover:border-emerald-300/70 hover:text-emerald-200"
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <p className="text-sm text-slate-300">{panels[2].description}</p>
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {onDeckItem ? (
                  <div
                    className={`rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/70 to-slate-950/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.45)] ${
                      focusedItemId === onDeckItem.id
                        ? 'ring-2 ring-emerald-300/70'
                        : ''
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleFocusToggle(onDeckItem.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleFocusToggle(onDeckItem.id);
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
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${statusTone(
                            onDeckItem.status,
                          )}`}
                        >
                          {formatStatus(onDeckItem.status)}
                        </span>
                        <span className="rounded-full border border-slate-700/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                          Locked
                        </span>
                      </div>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-slate-100">
                      {onDeckItem.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-300">
                      {onDeckItem.description}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      <span className="rounded-full border border-slate-800/80 px-2 py-1">
                        {formatAtomType(onDeckItem.atomType)}
                      </span>
                      <span className="rounded-full border border-slate-800/80 px-2 py-1">
                        Impact {impactFromLines(onDeckItem.estimatedLines)}
                      </span>
                      <span className="rounded-full border border-slate-800/80 px-2 py-1">
                        Effort {onDeckItem.effort}
                      </span>
                      <span className="rounded-full border border-slate-800/80 px-2 py-1">
                        ETA {estimateEta(onDeckItem.effort, onDeckItem.estimatedLines)}m
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span className="font-['JetBrains_Mono'] uppercase tracking-[0.2em]">
                        Visible
                      </span>
                      <span className="text-slate-200">
                        {onDeckItem.visibleChange}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-800/80 bg-slate-950/40 p-4 text-sm text-slate-400">
                    <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-500">
                      On Deck
                    </div>
                    <p className="mt-2 text-slate-300">
                      No active work item yet. Start a conversation to populate the backlog.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-400">
                    Backlog Queue
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {isReorderPending ? 'Reviewing reorder' : 'Drag to reorder'}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {queueItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-800/80 bg-slate-950/40 p-4 text-sm text-slate-400">
                      <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-500">
                        Backlog
                      </div>
                      <p className="mt-2 text-slate-300">
                        No backlog items yet. Keep chatting to generate the next batch.
                      </p>
                    </div>
                  ) : (
                    <div
                      role="list"
                      className={`flex flex-col gap-3 ${
                        isPaused ? 'opacity-70' : ''
                      } ${revertPulse ? 'animate-backlog-revert' : ''}`}
                    >
                      {queueItems.map((item) => {
                        const isFocused = focusedItemId === item.id;
                        const isDragTarget = dragOverId === item.id;
                        const isDraggable =
                          !isPaused && !isReorderPending && item.status === 'backlog';
                        const isDenied = deniedItemId === item.id;
                        return (
                          <div
                            key={item.id}
                            role="listitem"
                            tabIndex={0}
                            draggable={isDraggable}
                            aria-grabbed={isDraggable && draggedId === item.id}
                            onClick={() => handleFocusToggle(item.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleFocusToggle(item.id);
                              }
                            }}
                            onDragStart={(event) => {
                              if (!isDraggable) return;
                              setDraggedId(item.id);
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', item.id);
                            }}
                            onDragOver={(event) => {
                              if (
                                isPaused ||
                                isReorderPending ||
                                !draggedId ||
                                draggedId === item.id
                              ) {
                                return;
                              }
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
                              if (
                                isPaused ||
                                isReorderPending ||
                                !draggedId ||
                                draggedId === item.id
                              ) {
                                return;
                              }
                              event.preventDefault();

                              const currentQueueIds = queueItems.map((entry) => entry.id);
                              const fromQueueIndex = currentQueueIds.findIndex(
                                (id) => id === draggedId,
                              );
                              const toQueueIndex = currentQueueIds.findIndex(
                                (id) => id === item.id,
                              );
                              if (fromQueueIndex < 0 || toQueueIndex < 0) return;

                              const nextQueueOrder = reorderArray(
                                currentQueueIds,
                                fromQueueIndex,
                                toQueueIndex,
                              );
                              const fromItem = queueItems[fromQueueIndex];
                              const toItem = queueItems[toQueueIndex];

                              setQueueOrderOverride(nextQueueOrder);
                              setPendingReorder({
                                fromId: draggedId,
                                toId: item.id,
                                originalOrder: currentQueueIds,
                                nextOrder: nextQueueOrder,
                              });
                              setDraggedId(null);
                              setDragOverId(null);

                              void (async () => {
                                try {
                                  const decision = await evaluateReorder(
                                    fromQueueIndex,
                                    toQueueIndex,
                                    queueItems,
                                  );

                                  if (!decision.approved) {
                                    setQueueOrderOverride(null);
                                    setPendingReorder(null);
                                    triggerRevertPulse();
                                    if (fromItem) {
                                      triggerDeniedHighlight(fromItem.id);
                                    }
                                    addFocusedMessage(
                                      buildNarrationMessage(
                                        activeSessionId,
                                        'chat_ai',
                                        `Reorder denied: ${decision.reason} Keeping the current queue.`,
                                        fromItem?.id,
                                      ),
                                    );
                                    return;
                                  }

                                  const nextItems = applyQueueOrder(
                                    backlogItems,
                                    nextQueueOrder,
                                  );
                                  setBacklogItems(nextItems);
                                  setQueueOrderOverride(null);
                                  setPendingReorder(null);
                                  emitBacklogReorder(
                                    draggedId,
                                    item.id,
                                    nextQueueOrder,
                                  );
                                  if (fromItem && toItem) {
                                    const direction =
                                      fromQueueIndex < toQueueIndex ? 'after' : 'before';
                                    addFocusedMessage(
                                      buildNarrationMessage(
                                        activeSessionId,
                                        'chat_ai',
                                        `Reorder approved. "${fromItem.title}" now sits ${direction} "${toItem.title}".`,
                                        fromItem.id,
                                      ),
                                    );
                                  }
                                } catch (error) {
                                  setQueueOrderOverride(null);
                                  setPendingReorder(null);
                                  triggerRevertPulse();
                                  if (fromItem) {
                                    triggerDeniedHighlight(fromItem.id);
                                  }
                                  addFocusedMessage(
                                    buildNarrationMessage(
                                      activeSessionId,
                                      'chat_ai',
                                      'Reorder denied due to a review error. Keeping the current queue.',
                                      fromItem?.id,
                                    ),
                                  );
                                }
                              })();
                            }}
                            onDragEnd={() => {
                              setDraggedId(null);
                              setDragOverId(null);
                            }}
                            className={`rounded-2xl border border-slate-800/80 bg-slate-900/60 px-4 py-3 transition ${
                              isFocused ? 'ring-2 ring-emerald-300/60' : ''
                            } ${isDenied ? 'ring-2 ring-rose-400/70' : ''} ${
                              isDragTarget ? 'border-emerald-300/70' : ''
                            } ${
                              isDraggable
                                ? 'cursor-grab'
                                : isReorderPending
                                  ? 'cursor-wait'
                                  : 'cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${statusTone(
                                      item.status,
                                    )}`}
                                  >
                                    {formatStatus(item.status)}
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
                                  {item.description}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                <span className="rounded-full border border-slate-800/80 px-2 py-1">
                                  {formatAtomType(item.atomType)}
                                </span>
                                <span className="rounded-full border border-slate-800/80 px-2 py-1">
                                  Impact {impactFromLines(item.estimatedLines)}
                                </span>
                                <span className="rounded-full border border-slate-800/80 px-2 py-1">
                                  Effort {item.effort}
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              <span>Priority {index + 1}</span>
                              <span>
                                {isPaused
                                  ? 'Paused'
                                  : item.status === 'backlog'
                                    ? 'Drag ready'
                                    : formatStatus(item.status)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {completedItems.length > 0 && (
                  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4 text-sm text-slate-300">
                    <button
                      type="button"
                      onClick={() => setShowCompleted((prev) => !prev)}
                      className="flex w-full items-center justify-between text-left font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-400"
                    >
                      <span>Completed</span>
                      <span>{completedItems.length}</span>
                    </button>
                    {showCompleted && (
                      <div className="mt-3 flex flex-col gap-2">
                        {completedItems.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-xs text-slate-300"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-100">
                                {item.title}
                              </span>
                              <span className="rounded-full border border-slate-700/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                {formatAtomType(item.atomType)}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">
                              {item.visibleChange}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function formatAtomType(atomType: AtomType): string {
  switch (atomType) {
    case 'structure':
      return 'Structure';
    case 'content':
      return 'Content';
    case 'style':
      return 'Style';
    case 'behavior':
      return 'Behavior';
    case 'integration':
      return 'Integration';
    default:
      return 'Unknown';
  }
}

function impactFromLines(estimatedLines: number): 'Low' | 'Medium' | 'High' {
  if (estimatedLines >= 100) {
    return 'High';
  }
  if (estimatedLines >= 50) {
    return 'Medium';
  }
  return 'Low';
}

function estimateEta(effort: Effort, estimatedLines: number): number {
  const base = effort === 'L' ? 40 : effort === 'M' ? 25 : 12;
  const lineFactor = Math.min(18, Math.max(0, Math.round(estimatedLines / 8)));
  return Math.max(8, base + lineFactor);
}

function formatStatus(status: WorkItemStatus): string {
  switch (status) {
    case 'backlog':
      return 'Backlog';
    case 'on_deck':
      return 'On deck';
    case 'in_progress':
      return 'In progress';
    case 'blocked':
      return 'Blocked';
    case 'done':
      return 'Done';
    default:
      return 'Unknown';
  }
}

function statusTone(status: WorkItemStatus): string {
  switch (status) {
    case 'on_deck':
      return 'bg-emerald-300/20 text-emerald-200';
    case 'in_progress':
      return 'bg-amber-300/15 text-amber-200';
    case 'blocked':
      return 'bg-rose-400/15 text-rose-200';
    case 'done':
      return 'bg-slate-800/70 text-slate-300';
    default:
      return 'bg-slate-800/80 text-slate-300';
  }
}
