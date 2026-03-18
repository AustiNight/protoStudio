import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resetChlorastroliteSession } from '@/components/preview/ChlorastroliteLoader';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { LogViewerPanel } from '@/components/shared/LogViewerPanel';
import { NewConversationDialog } from '@/components/shared/NewConversationDialog';
import { SessionRecoveryDialog } from '@/components/shared/SessionRecoveryDialog';
import { SettingsModal } from '@/components/shared/SettingsModal';
import { supportsOpenAIReasoningForModel } from '@/config/openai-reasoning';
import { runtimeConfig } from '@/config/runtime-config';
import { BuilderLoop, type BacklogController } from '@/engine/builder/builder-loop';
import { FirstMessagePath } from '@/engine/chat/first-message';
import {
  getErrorChatMessage,
  getMilestoneChatMessage,
  getSkipChatMessage,
  getSwapChatMessage,
} from '@/engine/chat/narration';
import {
  buildBacklogPrompt,
  evaluateReorder,
  parseBacklogResponse,
  parseWorkItemsResponse,
  validateAtomSizing,
} from '@/engine/chat/po-logic';
import { buildPreviewSecurityHeaders } from '@/engine/guardrails/guardrails';
import { ContextManager } from '@/engine/llm/context';
import { LLMGateway } from '@/engine/llm/gateway';
import { OpenAIProvider } from '@/engine/llm/providers/openai';
import { TEMPLATE_CATALOG } from '@/engine/templates/catalog';
import { buildPreviewHtml } from '@/engine/vfs/preview';
import { VirtualFileSystem } from '@/engine/vfs/vfs';
import { SessionCheckpoint } from '@/persistence/checkpoint';
import { useBacklogStore } from '@/store/backlog-store';
import { useBuildStore } from '@/store/build-store';
import { useChatStore } from '@/store/chat-store';
import type { SettingsPayload } from '@/store/settings-store';
import { useSettingsStore } from '@/store/settings-store';
import { buildSessionCostSummary, useTelemetryStore } from '@/store/telemetry-store';
import type { ChatMessage, ClassificationResult } from '@/types/chat';
import type { AtomType, Effort, WorkItem, WorkItemStatus } from '@/types/backlog';
import type { BuildPatch } from '@/types/patch';
import type { LLMMessage, LLMProviderClient, RawLLMResponse } from '@/types/llm';
import type { BuildPhase } from '@/types/build';
import type { RecoveryState } from '@/types/persistence';
import type { TelemetrySessionPath } from '@/types/telemetry';
import type { LLMConfig, LLMProviderName, Session, SessionPath, StudioState } from '@/types/session';
import type { TemplateConfig } from '@/types/template';
import type { VfsSnapshot } from '@/types/vfs';
import { studioLog } from '@/utils/studio-logger';
import { groupChatMessages, type GroupPosition } from '@/utils/chatGrouping';

type PanelKey = 'chat' | 'preview' | 'backlog' | 'logs';
type PreviewSlot = 'blue' | 'green';

const panels: Array<{
  id: PanelKey;
  label: string;
}> = [
  {
    id: 'chat',
    label: 'Chat',
  },
  {
    id: 'preview',
    label: 'Preview',
  },
  {
    id: 'backlog',
    label: 'Backlog',
  },
  {
    id: 'logs',
    label: 'Log Viewer',
  },
];

const panelShell =
  'relative flex flex-col gap-3 rounded-3xl border border-slate-800/70 bg-slate-900/60 p-4 shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur';
const previewPanelShell = `${panelShell} min-h-[50vh] lg:min-h-[56vh]`;
const workPanelShell =
  `${panelShell} h-[780px] sm:h-[840px] lg:h-[880px] xl:h-[76vh] xl:min-h-[780px] xl:max-h-[980px]`;
const logsPanelShell = `${panelShell} min-h-[300px] xl:min-h-[320px]`;

const CHAT_SYSTEM_PROMPT = [
  'You are the chat AI for prontoproto.studio.',
  'Give direct, concise, practical guidance for website-building requests.',
  'Ask one clarifying question when needed.',
  'Do not claim to have completed actions unless they are confirmed by the app state.',
].join('\n');
const MAX_CHAT_CONTEXT_MESSAGES = 20;
const CHAT_RESPONSE_MAX_TOKENS = 600;
const CHAT_EMPTY_RETRY_MAX_TOKENS = 1800;
const CHECKPOINT_AUTOSAVE_INTERVAL_MS = 45_000;
const CHECKPOINT_CHANGE_DEBOUNCE_MS = 1_500;
const AUTO_CRITIC_MAX_ROUNDS = 10;
const AUTO_CRITIC_MIN_ACCEPTABLE_SCORE = 94;
const AUTO_CRITIC_COOLDOWN_MS = 12_000;
const AUTO_CRITIC_MIN_DIMENSION_SCORE = 88;
const AUTO_CRITIC_MAX_NOOP_ROUNDS = 3;
const USE_MOCK_LLM =
  import.meta.env.MODE === 'e2e' ||
  (import.meta.env.DEV && !runtimeConfig.useRealLlm);
const BUILDER_LOOP_DELAY_MS = runtimeConfig.builderLoopDelayMs;
const PREVIEW_SWAP_EVENT = 'preview:swap';
const PREVIEW_ACTIVE_SLOT_EVENT = 'preview:active-slot';
const PREVIEW_STAGED_STATE_EVENT = 'preview:staged-state';
const BUILDER_SYSTEM_PROMPT = [
  'You are the Builder AI for prontoproto.studio.',
  'Return JSON only and produce a valid BuildPatch payload.',
  'Do not include markdown fences.',
].join('\n');
const BUILDER_PATCH_FORMAT = [
  'Return a single JSON object with this shape:',
  '{',
  '  "workItemId": "<exact on_deck id>",',
  '  "targetVersion": <current vfs version>,',
  '  "operations": [',
  '    { "op": "section.replace", "file": "index.html", "sectionId": "hero", "html": "<!-- PP:SECTION:hero -->...<!-- /PP:SECTION:hero -->", "ifVersion": <current vfs version> },',
  '    { "op": "section.insert", "file": "index.html", "before": "footer", "sectionId": "new-section", "html": "<!-- PP:SECTION:new-section -->...<!-- /PP:SECTION:new-section -->", "ifVersion": <current vfs version> },',
  '    { "op": "section.delete", "file": "index.html", "sectionId": "hero", "ifVersion": <current vfs version> },',
  '    { "op": "css.append", "file": "styles.css", "blockId": "hero", "css": "/* === PP:BLOCK:hero === */.../* === /PP:BLOCK:hero === */", "ifVersion": <current vfs version> },',
  '    { "op": "css.replace", "file": "styles.css", "blockId": "hero", "css": "/* === PP:BLOCK:hero === */.../* === /PP:BLOCK:hero === */", "ifVersion": <current vfs version> },',
  '    { "op": "js.append", "file": "main.js", "funcId": "hero-init", "js": "// === PP:FUNC:hero-init === ... // === /PP:FUNC:hero-init ===", "ifVersion": <current vfs version> },',
  '    { "op": "js.replace", "file": "main.js", "funcId": "hero-init", "js": "// === PP:FUNC:hero-init === ... // === /PP:FUNC:hero-init ===", "ifVersion": <current vfs version> },',
  '    { "op": "file.create", "file": "robots.txt", "content": "...", "ifAbsent": true },',
  '    { "op": "file.delete", "file": "old.txt", "ifVersion": <current vfs version> },',
  '    { "op": "meta.update", "file": "index.html", "fields": { "title": "..." } }',
  '  ]',
  '}',
  'Do not output alias operation names such as asset.create, file.add, or metadata.update.',
].join('\n');

const baseTimestamp = new Date('2025-02-01T18:30:00Z').getTime();
function buildSampleMessages(sessionId: string): ChatMessage[] {
  return [
    {
      id: 'm1',
      sessionId,
      timestamp: baseTimestamp,
      sender: 'user',
      content: 'We need a launch page for a ceramics studio in Portland.',
    },
    {
      id: 'm2',
      sessionId,
      timestamp: baseTimestamp + 45_000,
      sender: 'user',
      content: 'Lean on warm neutrals and show upcoming classes.',
    },
    {
      id: 'm3',
      sessionId,
      timestamp: baseTimestamp + 120_000,
      sender: 'chat_ai',
      content: 'Got it. Building a calm, tactile layout with classes up front.',
    },
    {
      id: 'm4',
      sessionId,
      timestamp: baseTimestamp + 165_000,
      sender: 'chat_ai',
      content: 'Do you want a waitlist form or direct booking buttons?',
    },
    {
      id: 'm5',
      sessionId,
      timestamp: baseTimestamp + 240_000,
      sender: 'user',
      content: 'Add a waitlist form for now. We will add booking later.',
    },
    {
      id: 'm6',
      sessionId,
      timestamp: baseTimestamp + 360_000,
      sender: 'system',
      content: 'Preview build queued. ETA 24 seconds.',
    },
  ];
}

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

function buildLlmConfigFromSettings(settings: SettingsPayload): LLMConfig {
  const buildSelection = (
    providerName: LLMProviderName,
    model: string,
    apiKey: string,
  ) => ({
    provider: {
      name: providerName,
      apiKey,
      models: [model],
    },
    model,
  });

  const chatSelection = settings.llmModels.chat;
  const builderSelection = settings.llmModels.builder;

  return {
    chatModel: buildSelection(
      chatSelection.provider,
      chatSelection.model,
      settings.llmKeys[chatSelection.provider].trim(),
    ),
    builderModel: buildSelection(
      builderSelection.provider,
      builderSelection.model,
      settings.llmKeys[builderSelection.provider].trim(),
    ),
    openAIReasoning: {
      chat: settings.openaiThinking.chat,
      builder: settings.openaiThinking.builder,
    },
  };
}

function shouldRequireClientApiKey(providerName: LLMProviderName): boolean {
  if (providerName !== 'openai') {
    return true;
  }
  return runtimeConfig.openAIRequestMode !== 'proxy';
}

function createRuntimeGateway(config: LLMConfig): LLMGateway {
  return new LLMGateway(config, {
    providers: {
      openai: new OpenAIProvider({
        requestMode: runtimeConfig.openAIRequestMode,
        proxyBaseUrl: runtimeConfig.openAIProxyBaseUrl,
      }),
    },
    telemetry: useTelemetryStore.getState().createGatewayTelemetry(),
  });
}

function toChatContextMessages(messages: ChatMessage[]): LLMMessage[] {
  return messages
    .filter((message) => {
      if (message.sender === 'system') {
        return false;
      }
      if (message.sender === 'user') {
        return true;
      }
      // Keep assistant history grounded in actual model outputs, not app narration.
      return typeof message.metadata?.tokensUsed === 'number';
    })
    .slice(-MAX_CHAT_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.sender === 'user' ? 'user' : 'assistant',
      content: message.content,
    }));
}

function getChatErrorMessage(
  provider: LLMProviderName,
  error: { code?: string; message: string; details?: unknown },
): string {
  if (error.code === 'auth') {
    if (provider === 'openai' && runtimeConfig.openAIRequestMode === 'proxy') {
      return 'OpenAI authentication failed at the server proxy. Rotate OPENAI_API_KEY and retry.';
    }
    return `${provider} authentication failed. Update your API key in Settings and try again.`;
  }
  if (error.code === 'rate_limit') {
    return `${provider} rate limit hit. Wait a moment, then retry.`;
  }
  if (error.code === 'timeout') {
    return `${provider} timed out before responding. Please retry.`;
  }
  if (error.code === 'provider_error') {
    const details = asRecord(error.details);
    const cause = typeof details?.cause === 'string' ? details.cause.trim() : '';
    const hint = typeof details?.hint === 'string' ? details.hint.trim() : '';
    const bodyMessage = extractProviderBodyMessage(details?.body);
    if (cause.length > 0 && hint.length > 0) {
      return `${error.message} (${cause}) ${hint}`;
    }
    if (cause.length > 0) {
      return `${error.message} (${cause})`;
    }
    if (bodyMessage.length > 0) {
      if (error.message.includes(bodyMessage)) {
        return error.message;
      }
      return `${error.message} (${bodyMessage})`;
    }
    if (hint.length > 0) {
      return `${error.message} ${hint}`;
    }
  }
  return error.message || `${provider} failed to return a response.`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function extractProviderBodyMessage(body: unknown): string {
  if (typeof body !== 'string') {
    return '';
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const root = asRecord(parsed);
    const nested = asRecord(root?.error);
    const message = typeof nested?.message === 'string' ? nested.message.trim() : '';
    if (message) {
      return message;
    }
  } catch {
    // Fall through to raw-body fallback.
  }

  if (trimmed.length <= 220) {
    return trimmed;
  }
  return `${trimmed.slice(0, 220)}...`;
}

function sanitizeIdentifier(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'update';
}

function pickMockTemplateId(message: string): string {
  const normalized = message.toLowerCase();
  if (/(store|shop|checkout|cart|product)/.test(normalized)) {
    return 'simple-store';
  }
  if (/(portfolio|case study|gallery|photography)/.test(normalized)) {
    return 'portfolio';
  }
  if (/(blog|article|post|newsletter)/.test(normalized)) {
    return 'blog';
  }
  if (/(book|appointment|calendar|schedule|reservation)/.test(normalized)) {
    return 'bookings';
  }
  if (/(saas|startup|launch|landing)/.test(normalized)) {
    return 'marketing';
  }
  return 'small-business';
}

function buildMockSiteTitle(message: string): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return 'Launch Studio';
  }
  const words = compact
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 3);
  if (words.length === 0) {
    return 'Launch Studio';
  }
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function buildMockClassificationResponse(message: string, model: string): RawLLMResponse {
  const templateId = pickMockTemplateId(message);
  const title = buildMockSiteTitle(message);
  const payload = {
    path: 'template' as const,
    templateId,
    confidence: 0.9,
    reasoning: `The request best fits the "${templateId}" template.`,
    suggestedCustomization: {
      title,
      slogan: 'Built fast, then refined iteratively.',
      primaryColor: '#0ea5e9',
      industry: 'general',
    },
  };

  return {
    content: JSON.stringify(payload),
    usage: { promptTokens: 120, completionTokens: 48 },
    model,
    latencyMs: 180,
  };
}

function buildMockBacklogResponse(templateId: string): RawLLMResponse {
  const baseItems = [
    {
      title: 'Refine hero positioning',
      description: 'Adjust the hero section structure for clearer primary action.',
      atomType: 'structure',
      filesTouch: ['index.html'],
      estimatedLines: 70,
      visibleChange: 'Hero section hierarchy is clearer and CTA placement is improved.',
      dependencies: [],
    },
    {
      title: 'Tune brand accents',
      description: 'Apply a consistent accent treatment to buttons and highlights.',
      atomType: 'style',
      filesTouch: ['styles.css'],
      estimatedLines: 48,
      visibleChange: 'Buttons and highlight accents use a more cohesive style.',
      dependencies: ['Refine hero positioning'],
    },
    {
      title: 'Improve interaction feedback',
      description: 'Add subtle interaction feedback for key controls in the primary flow.',
      atomType: 'behavior',
      filesTouch: ['main.js'],
      estimatedLines: 36,
      visibleChange: 'Primary controls now show clearer interaction feedback.',
      dependencies: ['Tune brand accents'],
    },
  ];

  return {
    content: JSON.stringify(baseItems),
    usage: { promptTokens: 220, completionTokens: 160 },
    model: `${templateId}-mock`,
    latencyMs: 210,
  };
}

function buildMockChatReply(userInput: string, focusedItemTitle?: string): string {
  const focusLine = focusedItemTitle
    ? `I will keep this aligned with "${focusedItemTitle}". `
    : '';
  return `${focusLine}Drafting the next update based on: "${userInput.trim()}".`;
}

function createMockGateway(
  config: LLMConfig,
  responder: (args: {
    model: string;
    messages: LLMMessage[];
    callCount: number;
  }) => RawLLMResponse,
): LLMGateway {
  let callCount = 0;
  const provider: LLMProviderClient = {
    name: 'openai',
    async call(_apiKey, model, messages) {
      callCount += 1;
      return {
        ok: true,
        value: responder({ model, messages, callCount }),
      };
    },
  };

  return new LLMGateway(config, {
    providers: {
      openai: provider,
      anthropic: provider,
      google: provider,
    },
  });
}

function buildMockPatch(input: {
  atom: WorkItem;
  vfs: VirtualFileSystem;
  iteration: number;
}): BuildPatch {
  const { atom, vfs, iteration } = input;
  const targetVersion = vfs.getVersion();
  const touchedFiles = atom.filesTouch.filter((path) => vfs.hasFile(path));
  const allowFallback = touchedFiles.length === 0;
  const htmlFile =
    touchedFiles.find((path) => path.toLowerCase().endsWith('.html')) ??
    (allowFallback ? vfs.listFiles().find((path) => path.toLowerCase().endsWith('.html')) : undefined);
  const cssFile =
    touchedFiles.find((path) => path.toLowerCase().endsWith('.css')) ??
    (allowFallback ? vfs.listFiles().find((path) => path.toLowerCase().endsWith('.css')) : undefined);
  const jsFile =
    touchedFiles.find((path) => path.toLowerCase().endsWith('.js')) ??
    (allowFallback ? vfs.listFiles().find((path) => path.toLowerCase().endsWith('.js')) : undefined);

  // Keep mock patches continuity-safe by editing only files the atom intends to touch.
  if (atom.atomType === 'behavior' && jsFile) {
    const funcId = sanitizeIdentifier(`${atom.id}-mock-${targetVersion}-${iteration}`);
    const jsFunctionName = `run${funcId.replace(/-([a-z0-9])/g, (_, char: string) =>
      char.toUpperCase(),
    )}`;
    const js = [
      `// === PP:FUNC:${funcId} ===`,
      `function ${jsFunctionName}() {`,
      `  document.body?.setAttribute('data-${funcId}', '${targetVersion}.${iteration}');`,
      '}',
      `// === /PP:FUNC:${funcId} ===`,
    ].join('\n');

    return {
      workItemId: atom.id,
      targetVersion,
      operations: [
        {
          op: 'js.append',
          file: jsFile,
          funcId,
          js,
          ifVersion: targetVersion,
        },
      ],
    };
  }

  if (cssFile) {
    const blockId = sanitizeIdentifier(`${atom.id}-mock-${targetVersion}-${iteration}`);
    const css = [
      `/* === PP:BLOCK:${blockId} === */`,
      `.${blockId} {`,
      '  color: var(--color-text);',
      '  border-color: var(--color-primary);',
      '}',
      `/* === /PP:BLOCK:${blockId} === */`,
    ].join('\n');

    return {
      workItemId: atom.id,
      targetVersion,
      operations: [
        {
          op: 'css.append',
          file: cssFile,
          blockId,
          css,
          ifVersion: targetVersion,
        },
      ],
    };
  }

  if (jsFile) {
    const funcId = sanitizeIdentifier(`${atom.id}-mock-${targetVersion}-${iteration}`);
    const jsFunctionName = `run${funcId.replace(/-([a-z0-9])/g, (_, char: string) =>
      char.toUpperCase(),
    )}`;
    const js = [
      `// === PP:FUNC:${funcId} ===`,
      `function ${jsFunctionName}() {`,
      `  document.body?.setAttribute('data-${funcId}', '${targetVersion}.${iteration}');`,
      '}',
      `// === /PP:FUNC:${funcId} ===`,
    ].join('\n');

    return {
      workItemId: atom.id,
      targetVersion,
      operations: [
        {
          op: 'js.append',
          file: jsFile,
          funcId,
          js,
          ifVersion: targetVersion,
        },
      ],
    };
  }

  if (htmlFile) {
    return {
      workItemId: atom.id,
      targetVersion,
      operations: [
        {
          op: 'meta.update',
          file: htmlFile,
          fields: {
            description: `${atom.visibleChange} (build ${targetVersion}.${iteration})`,
          },
        },
      ],
    };
  }

  return {
    workItemId: atom.id,
    targetVersion,
    operations: [
      {
        op: 'meta.update',
        file: 'index.html',
        fields: {
          description: `${atom.visibleChange} (build ${targetVersion}.${iteration})`,
        },
      },
    ],
  };
}

function getOnDeckItemFromStore(): WorkItem | null {
  const state = useBacklogStore.getState();
  if (!state.onDeckId) {
    return null;
  }
  return state.items.find((item) => item.id === state.onDeckId) ?? null;
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

function createSessionId(): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `session-${Date.now()}-${randomPart}`;
}

function summarizeUserRequest(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Implement requested update';
  }
  const firstSentence = normalized.split(/[.!?]/)[0]?.trim() ?? normalized;
  const max = 72;
  if (firstSentence.length <= max) {
    return firstSentence;
  }
  return `${firstSentence.slice(0, max).trim()}...`;
}

function inferAtomTypeFromRequest(value: string): AtomType {
  const normalized = value.toLowerCase();
  if (/(menu|nav|link|button|click|toggle|interaction|scroll|animation|form submit)/.test(normalized)) {
    return 'behavior';
  }
  if (/(layout|section|page|header|footer|hero|structure|add page|new page)/.test(normalized)) {
    return 'structure';
  }
  if (/(color|font|typography|style|theme|spacing|shadow|gradient|design)/.test(normalized)) {
    return 'style';
  }
  if (/(api|map|embed|analytics|deploy|token|auth|integration|webhook)/.test(normalized)) {
    return 'integration';
  }
  return 'content';
}

function defaultFilesForAtomType(atomType: AtomType): string[] {
  switch (atomType) {
    case 'behavior':
      return ['main.js', 'index.html'];
    case 'style':
      return ['styles.css', 'index.html'];
    case 'integration':
      return ['index.html', 'main.js'];
    default:
      return ['index.html'];
  }
}

function splitRequestIntoClauses(value: string): string[] {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }
  const split = normalized
    .split(/\b(?:and then|then|also|plus)\b|[.;]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (split.length === 0) {
    return [normalized];
  }
  return split.slice(0, 4);
}

type AutonomousCriticEnvelope = {
  score: number;
  done: boolean;
  summary: string;
  dimensions: {
    ux: number;
    visual: number;
    accessibility: number;
    trust: number;
    conversion: number;
    performance: number;
  } | null;
  items: WorkItem[];
};

function extractJsonPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function parseAutonomousCriticEnvelope(
  content: string,
  sessionId: string,
): AutonomousCriticEnvelope | null {
  const payload = extractJsonPayload(content);
  if (!payload) {
    return null;
  }
  try {
    const parsed = JSON.parse(payload) as {
      score?: unknown;
      done?: unknown;
      summary?: unknown;
      dimensions?: unknown;
      items?: unknown;
    };
    const score =
      typeof parsed.score === 'number' && Number.isFinite(parsed.score)
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : 0;
    const done = parsed.done === true;
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary.trim() : 'No summary provided.';
    const rawDimensions =
      parsed.dimensions && typeof parsed.dimensions === 'object' ? parsed.dimensions : null;
    const parseDimension = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(100, Math.round(value)))
        : 0;
    const dimensions = rawDimensions
      ? {
          ux: parseDimension((rawDimensions as Record<string, unknown>).ux),
          visual: parseDimension((rawDimensions as Record<string, unknown>).visual),
          accessibility: parseDimension((rawDimensions as Record<string, unknown>).accessibility),
          trust: parseDimension((rawDimensions as Record<string, unknown>).trust),
          conversion: parseDimension((rawDimensions as Record<string, unknown>).conversion),
          performance: parseDimension((rawDimensions as Record<string, unknown>).performance),
        }
      : null;
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = parseWorkItemsResponse(
      {
        content: JSON.stringify(rawItems),
      },
      { sessionId },
    );
    return {
      score,
      done,
      summary,
      dimensions,
      items,
    };
  } catch {
    return null;
  }
}

type PreviewRouteMap = Record<string, string>;

type PreviewSwapPayload = {
  html: string;
  pagePath?: string;
  routes?: PreviewRouteMap;
};

function buildPreviewRouteMap(vfs: VirtualFileSystem): PreviewRouteMap {
  const routeMap: PreviewRouteMap = {};
  const htmlFiles = vfs
    .listFiles()
    .filter((path) => path.toLowerCase().endsWith('.html'));

  for (const path of htmlFiles) {
    const preview = buildPreviewHtml(vfs, path);
    if (preview.ok) {
      routeMap[path] = preview.value.html;
    }
  }

  return routeMap;
}

function buildPreviewSwapPayload(
  vfs: VirtualFileSystem,
  html: string,
): PreviewSwapPayload {
  const preview = buildPreviewHtml(vfs);
  if (!preview.ok) {
    return { html };
  }

  const routes = buildPreviewRouteMap(vfs);
  if (!(preview.value.pagePath in routes)) {
    routes[preview.value.pagePath] = html;
  }

  return {
    html,
    pagePath: preview.value.pagePath,
    routes,
  };
}

function hydrateVfsFromSnapshot(snapshot: VfsSnapshot): VirtualFileSystem {
  return new VirtualFileSystem({
    metadata: snapshot.metadata,
    templateId: snapshot.templateId,
    version: snapshot.version,
    files: snapshot.files,
  });
}

export function Layout() {
  const [, setActivePanel] = useState<PanelKey>('chat');
  const [activeSessionId, setActiveSessionId] = useState(() => createSessionId());
  const [chatDraft, setChatDraft] = useState('');
  const [recoveryState, setRecoveryState] = useState<RecoveryState | null>(null);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const messages = useChatStore((state) => state.messages);
  const addMessage = useChatStore((state) => state.addMessage);
  const setMessages = useChatStore((state) => state.setMessages);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const sessionMessages = useMemo(
    () => messages.filter((message) => message.sessionId === activeSessionId),
    [activeSessionId, messages],
  );
  const groupedMessages = useMemo(() => groupChatMessages(sessionMessages), [sessionMessages]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seededMessagesRef = useRef(false);
  const narrationRef = useRef<NarrationCheckpoint | null>(null);
  const [isAwaitingChatResponse, setIsAwaitingChatResponse] = useState(false);
  const activeSessionIdRef = useRef(activeSessionId);
  const chatRequestIdRef = useRef(0);
  const workingVfsRef = useRef<VirtualFileSystem | null>(null);
  const injectedPreviewHtmlRef = useRef<string | null>(null);
  const previewActiveSlotRef = useRef<PreviewSlot>('blue');
  const previewHasStagedRef = useRef(false);
  const [previewHasStaged, setPreviewHasStaged] = useState(false);
  const builderRunningRef = useRef(false);
  const builderCycleRef = useRef(0);
  const [hasPreview, setHasPreview] = useState(false);
  const isTyping = isAwaitingChatResponse;
  const backlogItems = useBacklogStore((state) => state.items);
  const onDeckItem = useBacklogStore((state) =>
    state.onDeckId ? state.items.find((item) => item.id === state.onDeckId) ?? null : null,
  );
  const focusedItemId = useBacklogStore((state) => state.focusedItemId);
  const focusItem = useBacklogStore((state) => state.focusItem);
  const promoteNext = useBacklogStore((state) => state.promoteNext);
  const insertItemsAfterActive = useBacklogStore((state) => state.insertItemsAfterActive);
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
  const telemetryEvents = useTelemetryStore((state) => state.events);
  const telemetrySessionId = useTelemetryStore((state) => state.sessionId);
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
  const [previewAutomationPaused, setPreviewAutomationPaused] = useState(false);
  const [autoFocusOnDeck, setAutoFocusOnDeck] = useState(true);
  const [blockedTrayOpen, setBlockedTrayOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const revertTimerRef = useRef<number | null>(null);
  const deniedTimerRef = useRef<number | null>(null);
  const telemetryInitializedRef = useRef(false);
  const autonomousCriticRunningRef = useRef(false);
  const autonomousCriticRoundsRef = useRef(0);
  const autonomousCriticNoopRoundsRef = useRef(0);
  const autonomousCriticCooldownUntilRef = useRef(0);
  const autonomousCriticStoppedRef = useRef(false);
  const sessionCreatedAtRef = useRef(Date.now());
  const sessionPathRef = useRef<SessionPath>('scratch');
  const sessionTemplateIdRef = useRef<string | undefined>(undefined);
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

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    chatRequestIdRef.current += 1;
    setIsAwaitingChatResponse(false);
    workingVfsRef.current = null;
    injectedPreviewHtmlRef.current = null;
    previewActiveSlotRef.current = 'blue';
    previewHasStagedRef.current = false;
    setPreviewHasStaged(false);
    builderCycleRef.current = 0;
    builderRunningRef.current = false;
    autonomousCriticRunningRef.current = false;
    autonomousCriticRoundsRef.current = 0;
    autonomousCriticNoopRoundsRef.current = 0;
    autonomousCriticCooldownUntilRef.current = 0;
    autonomousCriticStoppedRef.current = false;
    setHasPreview(false);
  }, [activeSessionId]);

  useEffect(() => {
    const onPreviewActiveSlot = (event: Event) => {
      const customEvent = event as CustomEvent<{ slot?: unknown }>;
      const slot = customEvent.detail?.slot;
      if (slot !== 'blue' && slot !== 'green') {
        return;
      }
      previewActiveSlotRef.current = slot;
      studioLog({
        level: 'debug',
        source: 'preview.slot.active',
        sessionId: activeSessionIdRef.current,
        message: `Preview live slot is now ${slot}.`,
      });
    };

    window.addEventListener(PREVIEW_ACTIVE_SLOT_EVENT, onPreviewActiveSlot as EventListener);
    return () => {
      window.removeEventListener(PREVIEW_ACTIVE_SLOT_EVENT, onPreviewActiveSlot as EventListener);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setPreviewAutomationPaused((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onPreviewStagedState = (event: Event) => {
      const customEvent = event as CustomEvent<{ hasStaged?: unknown }>;
      const hasStaged = customEvent.detail?.hasStaged === true;
      previewHasStagedRef.current = hasStaged;
      setPreviewHasStaged(hasStaged);
      studioLog({
        level: 'debug',
        source: 'preview.staged.state',
        sessionId: activeSessionIdRef.current,
        message: hasStaged
          ? 'Builder paused until staged preview is validated/swapped.'
          : 'Staged preview cleared. Builder can continue.',
      });
    };

    window.addEventListener(PREVIEW_STAGED_STATE_EVENT, onPreviewStagedState as EventListener);
    return () => {
      window.removeEventListener(PREVIEW_STAGED_STATE_EVENT, onPreviewStagedState as EventListener);
    };
  }, []);

  useEffect(() => {
    studioLog({
      level: 'info',
      source: 'runtime.mode',
      sessionId: activeSessionId,
      message: USE_MOCK_LLM ? 'Running with mock LLM pipeline.' : 'Running with real LLM pipeline.',
      details: {
        useRealLlm: runtimeConfig.useRealLlm,
        mode: import.meta.env.MODE,
        logViewerEnabled: runtimeConfig.logViewerEnabled,
      },
    });
  }, [activeSessionId]);

  const emitPreviewSwap = useCallback((input: string | PreviewSwapPayload) => {
    const payload: PreviewSwapPayload = typeof input === 'string' ? { html: input } : input;
    injectedPreviewHtmlRef.current = payload.html;
    const nextSlot: PreviewSlot =
      previewActiveSlotRef.current === 'blue' ? 'green' : 'blue';
    studioLog({
      level: 'debug',
      source: 'preview.swap.emit',
      sessionId: activeSessionIdRef.current,
      message: `Dispatching preview swap to ${nextSlot}.`,
      details: {
        htmlLength: payload.html.length,
        slot: nextSlot,
        pagePath: payload.pagePath ?? null,
        routeCount: payload.routes ? Object.keys(payload.routes).length : 0,
      },
    });
    setHasPreview(true);
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(
      new CustomEvent(PREVIEW_SWAP_EVENT, {
        detail: {
          html: payload.html,
          slot: nextSlot,
          pagePath: payload.pagePath,
          routes: payload.routes,
        },
      }),
    );
  }, []);

  const requestChatResponse = useCallback(async () => {
    const requestSessionId = activeSessionId;
    const requestId = chatRequestIdRef.current + 1;
    chatRequestIdRef.current = requestId;
    setIsAwaitingChatResponse(true);

    const settings = useSettingsStore.getState().settings;
    const providerName = settings.llmModels.chat.provider;
    const modelName = settings.llmModels.chat.model;

    studioLog({
      level: 'debug',
      source: 'chat.request',
      sessionId: requestSessionId,
      message: 'Requesting chat response.',
      details: {
        requestId,
        useMock: USE_MOCK_LLM,
        provider: providerName,
        model: modelName,
        reasoningEffort:
          providerName === 'openai' ? settings.openaiThinking.chat : undefined,
      },
    });

    try {
      const latestMessages = useChatStore
        .getState()
        .messages.filter((message) => message.sessionId === requestSessionId);

      if (USE_MOCK_LLM) {
        const lastUser = [...latestMessages].reverse().find((message) => message.sender === 'user');
        const focusedItem = focusedItemId
          ? useBacklogStore
              .getState()
              .items.find((item) => item.id === focusedItemId) ?? null
          : null;
        const reply = buildMockChatReply(lastUser?.content ?? '', focusedItem?.title);
        await new Promise((resolve) => window.setTimeout(resolve, 280));
        if (
          chatRequestIdRef.current !== requestId ||
          activeSessionIdRef.current !== requestSessionId
        ) {
          return;
        }
        addFocusedMessage(buildNarrationMessage(requestSessionId, 'chat_ai', reply));
        studioLog({
          level: 'debug',
          source: 'chat.response.mock',
          sessionId: requestSessionId,
          message: 'Mock chat response generated.',
          details: { requestId },
        });
        return;
      }

      const apiKey = settings.llmKeys[providerName].trim();
      if (shouldRequireClientApiKey(providerName) && !apiKey) {
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'system',
            'No chat API key is configured. Add one in Settings to get AI responses.',
          ),
        );
        return;
      }

      const gateway = createRuntimeGateway(buildLlmConfigFromSettings(settings));
      const contextMessages = toChatContextMessages(latestMessages);
      const userContextCount = contextMessages.filter((message) => message.role === 'user').length;
      const assistantContextCount = contextMessages.length - userContextCount;
      studioLog({
        level: 'debug',
        source: 'chat.request.context',
        sessionId: requestSessionId,
        message: 'Built chat context window.',
        details: {
          requestId,
          totalMessagesInSession: latestMessages.length,
          contextMessages: contextMessages.length,
          userContextCount,
          assistantContextCount,
        },
      });
      const focusedContext = focusedItemId
        ? `\nFocused backlog item: ${focusedItemId}. Keep the response aligned with this item when relevant.`
        : '';
      const baseRequest = {
        role: 'chat',
        systemPrompt: `${CHAT_SYSTEM_PROMPT}${focusedContext}`,
        messages: contextMessages,
        temperature: 0.4,
        maxTokens: CHAT_RESPONSE_MAX_TOKENS,
      } as const;
      let result = await gateway.send(baseRequest);

      if (chatRequestIdRef.current !== requestId) {
        return;
      }
      if (activeSessionIdRef.current !== requestSessionId) {
        return;
      }

      if (!result.ok) {
        studioLog({
          level: 'error',
          source: 'chat.response.error',
          sessionId: requestSessionId,
          message: 'Live chat response failed.',
          details: {
            requestId,
            provider: providerName,
            error: result.error,
          },
        });
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'system',
            getChatErrorMessage(providerName, result.error),
          ),
        );
        return;
      }

      let content = result.value.content.trim();
      let likelyTokenBudgetExhausted =
        result.value.usage.completionTokens >= baseRequest.maxTokens;
      if (!content) {
        const canTuneOpenAIReasoning =
          providerName === 'openai' && supportsOpenAIReasoningForModel(modelName);
        const retryMaxTokens = likelyTokenBudgetExhausted
          ? CHAT_EMPTY_RETRY_MAX_TOKENS
          : baseRequest.maxTokens;
        studioLog({
          level: 'warn',
          source: 'chat.response.empty',
          sessionId: requestSessionId,
          message: 'Live chat response was empty; retrying with explicit non-empty instruction.',
          details: {
            requestId,
            model: result.value.model,
            usage: result.value.usage,
            latencyMs: result.value.latencyMs,
            likelyTokenBudgetExhausted,
            retryMaxTokens,
            retryReasoningEffort: canTuneOpenAIReasoning ? 'low' : undefined,
          },
        });
        const retryResult = await gateway.send({
          ...baseRequest,
          maxTokens: retryMaxTokens,
          reasoningEffort: canTuneOpenAIReasoning ? 'low' : undefined,
          systemPrompt:
            `${CHAT_SYSTEM_PROMPT}${focusedContext}\n` +
            'Your previous response was empty. Reply with at least one concise sentence in plain text.',
        });

        if (chatRequestIdRef.current !== requestId) {
          return;
        }
        if (activeSessionIdRef.current !== requestSessionId) {
          return;
        }

        if (!retryResult.ok) {
          studioLog({
            level: 'error',
            source: 'chat.response.retry.error',
            sessionId: requestSessionId,
            message: 'Chat retry after empty response failed.',
            details: {
              requestId,
              provider: providerName,
              error: retryResult.error,
            },
          });
          addFocusedMessage(
            buildNarrationMessage(
              requestSessionId,
              'system',
              getChatErrorMessage(providerName, retryResult.error),
            ),
          );
          return;
        }

        result = retryResult;
        content = result.value.content.trim();
        likelyTokenBudgetExhausted =
          result.value.usage.completionTokens >= retryMaxTokens;
      }

      if (!content) {
        studioLog({
          level: 'error',
          source: 'chat.response.empty',
          sessionId: requestSessionId,
          message: 'Live chat response remained empty after retry.',
          details: {
            requestId,
            model: result.value.model,
            usage: result.value.usage,
            latencyMs: result.value.latencyMs,
          },
        });
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'system',
            likelyTokenBudgetExhausted
              ? 'The model used the full response token budget without visible output. Try again or switch to a lower-reasoning chat model.'
              : 'The model returned an empty response twice. Try again or switch to another chat model.',
          ),
        );
        return;
      }

      addFocusedMessage({
        ...buildNarrationMessage(requestSessionId, 'chat_ai', content),
        metadata: {
          tokensUsed:
            result.value.usage.promptTokens + result.value.usage.completionTokens,
          cost: result.value.cost,
        },
      });
      studioLog({
        level: 'debug',
        source: 'chat.response.live',
        sessionId: requestSessionId,
        message: 'Live chat response received.',
        details: {
          requestId,
          contentLength: content.length,
          cost: result.value.cost,
        },
      });
    } catch (error) {
      if (chatRequestIdRef.current !== requestId) {
        return;
      }
      if (activeSessionIdRef.current !== requestSessionId) {
        return;
      }
      addFocusedMessage(
        buildNarrationMessage(
          requestSessionId,
          'system',
          error instanceof Error
            ? error.message
            : 'Unexpected chat error. Please retry.',
        ),
      );
    } finally {
      if (
        chatRequestIdRef.current === requestId &&
        activeSessionIdRef.current === requestSessionId
      ) {
        setIsAwaitingChatResponse(false);
      }
    }
  }, [activeSessionId, addFocusedMessage, focusedItemId]);

  const buildInitialBacklog = useCallback(
    async (
      classification: ClassificationResult,
      template: TemplateConfig,
      gateway: LLMGateway | null,
      providerName: LLMProviderName,
      requestSessionId: string,
    ): Promise<WorkItem[]> => {
      const response = USE_MOCK_LLM
        ? buildMockBacklogResponse(template.id)
        : (() => {
            if (!gateway) {
              throw new Error('Backlog generation gateway unavailable.');
            }
            return null;
          })();

      const resolvedResponse =
        response ??
        (await (async () => {
          const result = await gateway!.send(buildBacklogPrompt(classification, template));
          if (!result.ok) {
            throw new Error(getChatErrorMessage(providerName, result.error));
          }
          return result.value;
        })());

      const parsed = parseBacklogResponse(resolvedResponse, {
        sessionId: requestSessionId,
      });
      const validation = validateAtomSizing(parsed);
      if (!validation.valid) {
        const firstIssue = validation.issues[0];
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'system',
            `Backlog generated with validation warnings. First issue: ${firstIssue?.message ?? 'Unknown issue.'}`,
          ),
        );
      }
      return parsed;
    },
    [addFocusedMessage],
  );

  const planUserRequestBacklogItems = useCallback(
    async (rawContent: string): Promise<WorkItem[]> => {
      const content = rawContent.trim();
      if (!content) {
        return [];
      }
      const now = Date.now();
      const buildFallback = () => {
        const clauses = splitRequestIntoClauses(content);
        const items = clauses.map((clause, index) => {
          const atomType = inferAtomTypeFromRequest(clause);
          const title = summarizeUserRequest(clause);
          const id = `user-${now}-${index}-${sanitizeIdentifier(title).slice(0, 36)}`;
          return {
            id,
            sessionId: activeSessionId,
            title,
            description: clause,
            effort: 'M' as Effort,
            status: 'backlog' as WorkItemStatus,
            order: index + 1,
            dependencies: [],
            rationale: 'Directly requested by the user in chat.',
            createdAt: now,
            atomType,
            filesTouch: defaultFilesForAtomType(atomType),
            estimatedLines: 65,
            visibleChange: `Implements: ${title}`,
          };
        });
        return items;
      };

      if (USE_MOCK_LLM) {
        return buildFallback();
      }

      try {
        const settings = useSettingsStore.getState().settings;
        const llmConfig = buildLlmConfigFromSettings(settings);
        const providerName = settings.llmModels.chat.provider;
        const apiKey = settings.llmKeys[providerName].trim();
        if (shouldRequireClientApiKey(providerName) && !apiKey) {
          return buildFallback();
        }
        const gateway = createRuntimeGateway(llmConfig);
        const response = await gateway.send({
          role: 'chat',
          systemPrompt: [
            'You are a backlog planner for prontoproto.studio.',
            'Rewrite the user request into concise, implementation-ready Builder atoms.',
            'If the request mixes concerns, split into multiple atoms with dependencies.',
            'Keep total output text roughly similar in length to the user input.',
            'Return JSON array only, no prose.',
          ].join('\n'),
          messages: [
            {
              role: 'user',
              content: [
                `Session request: ${content}`,
                'Output item schema:',
                '{ "title": "...", "description": "...", "atomType": "structure|content|style|behavior|integration", "filesTouch": ["..."], "estimatedLines": 40, "visibleChange": "...", "dependencies": [] }',
              ].join('\n'),
            },
          ],
          responseFormat: 'json',
          temperature: 0.2,
          maxTokens: 900,
        });
        if (!response.ok) {
          return buildFallback();
        }
        const parsed = parseWorkItemsResponse(response.value, {
          sessionId: activeSessionId,
        });
        return parsed.length > 0 ? parsed : buildFallback();
      } catch {
        return buildFallback();
      }
    },
    [activeSessionId],
  );

  const runAutonomousCriticCycle = useCallback(async () => {
    const now = Date.now();
    if (autonomousCriticRunningRef.current || autonomousCriticStoppedRef.current) {
      return;
    }
    if (now < autonomousCriticCooldownUntilRef.current) {
      return;
    }
    if (autonomousCriticRoundsRef.current >= AUTO_CRITIC_MAX_ROUNDS) {
      autonomousCriticStoppedRef.current = true;
      addFocusedMessage(
        buildNarrationMessage(
          activeSessionId,
          'system',
          'Autonomous quality loop reached max rounds. Continuing only on explicit user requests.',
        ),
      );
      return;
    }
    const vfs = workingVfsRef.current;
    if (!vfs) {
      return;
    }

    autonomousCriticRunningRef.current = true;
    autonomousCriticRoundsRef.current += 1;
    const round = autonomousCriticRoundsRef.current;
    const requestSessionId = activeSessionIdRef.current;

    try {
      let envelope: AutonomousCriticEnvelope | null = null;

      if (USE_MOCK_LLM) {
        envelope = {
          score: round >= 2 ? 92 : 76,
          done: round >= 2,
          summary:
            round >= 2
              ? 'Mock critic found no remaining high-impact issues.'
              : 'Mock critic recommends one additional polish pass.',
          dimensions:
            round >= 2
              ? {
                  ux: 93,
                  visual: 94,
                  accessibility: 92,
                  trust: 93,
                  conversion: 91,
                  performance: 90,
                }
              : {
                  ux: 74,
                  visual: 76,
                  accessibility: 71,
                  trust: 73,
                  conversion: 72,
                  performance: 75,
                },
          items:
            round >= 2
              ? []
              : [
                  {
                    id: `critic-${now}-0`,
                    sessionId: requestSessionId,
                    title: 'Refine visual hierarchy for primary CTA',
                    description: 'Increase CTA prominence and tighten nearby spacing for clearer conversion focus.',
                    effort: 'S',
                    status: 'backlog',
                    order: 1,
                    dependencies: [],
                    rationale: 'Autonomous quality critic recommendation.',
                    createdAt: now,
                    atomType: 'style',
                    filesTouch: ['styles.css', 'index.html'],
                    estimatedLines: 45,
                    visibleChange: 'Primary CTA stands out more clearly against surrounding content.',
                  },
                ],
        };
      } else {
        const settings = useSettingsStore.getState().settings;
        const llmConfig = buildLlmConfigFromSettings(settings);
        const providerName = settings.llmModels.chat.provider;
        const apiKey = settings.llmKeys[providerName].trim();
        if (shouldRequireClientApiKey(providerName) && !apiKey) {
          return;
        }
        const gateway = createRuntimeGateway(llmConfig);
        const preview = buildPreviewHtml(vfs);
        const manifest = JSON.stringify(vfs.toManifest(), null, 2);
        const html = preview.ok ? preview.value.html.slice(0, 20_000) : '';
        const css = vfs.getFile('styles.css')?.content.slice(0, 20_000) ?? '';

        const criticResult = await gateway.send({
          role: 'chat',
          systemPrompt: [
            'You are an autonomous website quality critic for prontoproto.studio.',
            'Assess MVP maturity with rigor across UX, visual polish, accessibility, trust signals, and conversion clarity.',
            'Return strict JSON with shape:',
            '{ "score": 0-100, "done": boolean, "summary": "...", "dimensions": { "ux": 0-100, "visual": 0-100, "accessibility": 0-100, "trust": 0-100, "conversion": 0-100, "performance": 0-100 }, "items": [WorkItemLike] }',
            'Only set done=true when the site is mature and production-worthy for MVP quality.',
            `Do not set done=true unless score >= ${AUTO_CRITIC_MIN_ACCEPTABLE_SCORE}, each dimension >= ${AUTO_CRITIC_MIN_DIMENSION_SCORE}, and items is empty.`,
            'If not done, return 1-4 actionable, implementation-ready items.',
            'No markdown.',
          ].join('\n'),
          messages: [
            {
              role: 'user',
              content: [
                `Round: ${round}/${AUTO_CRITIC_MAX_ROUNDS}`,
                `Target done score: ${AUTO_CRITIC_MIN_ACCEPTABLE_SCORE}`,
                'Site manifest:',
                manifest,
                'Rendered HTML snapshot:',
                html,
                'Styles snapshot:',
                css,
                'Work item item schema:',
                '{ "title": "...", "description": "...", "atomType": "structure|content|style|behavior|integration", "filesTouch": ["..."], "estimatedLines": 40, "visibleChange": "...", "dependencies": [] }',
              ].join('\n\n'),
            },
          ],
          responseFormat: 'json',
          temperature: 0.2,
          maxTokens: 1200,
        });

        if (!criticResult.ok) {
          return;
        }
        envelope = parseAutonomousCriticEnvelope(criticResult.value.content, requestSessionId);
      }

      if (!envelope) {
        autonomousCriticNoopRoundsRef.current += 1;
        return;
      }

      const validation = validateAtomSizing(envelope.items);
      const safeItems = validation.valid ? envelope.items : envelope.items.slice(0, 1);

      if (safeItems.length > 0) {
        insertItemsAfterActive(safeItems);
        autonomousCriticNoopRoundsRef.current = 0;
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'chat_ai',
            `Autonomous quality review ${round}/${AUTO_CRITIC_MAX_ROUNDS} (score ${envelope.score}) queued ${safeItems.length} improvement task${safeItems.length === 1 ? '' : 's'}.`,
            safeItems[0]?.id ?? null,
          ),
        );
      } else {
        autonomousCriticNoopRoundsRef.current += 1;
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'chat_ai',
            `Autonomous quality review ${round}/${AUTO_CRITIC_MAX_ROUNDS}: ${envelope.summary}`,
          ),
        );
      }

      const dimensionsMeetFloor =
        envelope.dimensions === null ||
        Object.values(envelope.dimensions).every(
          (dimensionScore) => dimensionScore >= AUTO_CRITIC_MIN_DIMENSION_SCORE,
        );
      const doneByScore =
        envelope.score >= AUTO_CRITIC_MIN_ACCEPTABLE_SCORE &&
        safeItems.length === 0 &&
        dimensionsMeetFloor;
      const doneByReviewer =
        envelope.done &&
        envelope.score >= AUTO_CRITIC_MIN_ACCEPTABLE_SCORE &&
        safeItems.length === 0 &&
        dimensionsMeetFloor;
      const doneByNoop =
        autonomousCriticNoopRoundsRef.current >= AUTO_CRITIC_MAX_NOOP_ROUNDS &&
        envelope.score >= AUTO_CRITIC_MIN_ACCEPTABLE_SCORE - 2;
      if (doneByScore || doneByReviewer || doneByNoop) {
        autonomousCriticStoppedRef.current = true;
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'system',
            `Autonomous quality loop complete at score ${envelope.score}.`,
          ),
        );
      }
    } finally {
      autonomousCriticCooldownUntilRef.current = Date.now() + AUTO_CRITIC_COOLDOWN_MS;
      autonomousCriticRunningRef.current = false;
    }
  }, [activeSessionId, addFocusedMessage, insertItemsAfterActive]);

  const runBuilderCycle = useCallback(async () => {
    if (builderRunningRef.current) {
      return;
    }
    if (previewHasStagedRef.current) {
      return;
    }
    if (!workingVfsRef.current) {
      return;
    }
    if (useBuildStore.getState().isPaused) {
      return;
    }
    const onDeck = getOnDeckItemFromStore();
    if (!onDeck) {
      return;
    }
    const vfs = workingVfsRef.current;
    if (!vfs) {
      return;
    }

    const requestSessionId = activeSessionIdRef.current;
    const settings = useSettingsStore.getState().settings;
    const llmConfig = buildLlmConfigFromSettings(settings);
    const providerName = settings.llmModels.builder.provider;
    const telemetry = useTelemetryStore.getState();
    studioLog({
      level: 'debug',
      source: 'builder.cycle.start',
      sessionId: requestSessionId,
      message: `Starting builder cycle for "${onDeck.title}".`,
      details: {
        workItemId: onDeck.id,
        useMock: USE_MOCK_LLM,
      },
    });

    let gateway: LLMGateway;
    if (USE_MOCK_LLM) {
      gateway = createMockGateway(llmConfig, ({ model, callCount }) => {
        const atom = getOnDeckItemFromStore();
        const vfs = workingVfsRef.current;
        if (!atom || !vfs) {
          return {
            content: JSON.stringify({
              workItemId: 'mock-missing-atom',
              targetVersion: 1,
              operations: [],
            }),
            usage: { promptTokens: 80, completionTokens: 20 },
            model,
            latencyMs: 80,
          };
        }
        const patch = buildMockPatch({
          atom,
          vfs,
          iteration: builderCycleRef.current + callCount,
        });
        return {
          content: JSON.stringify(patch),
          usage: { promptTokens: 180, completionTokens: 90 },
          model,
          latencyMs: 120,
        };
      });
    } else {
      const apiKey = settings.llmKeys[providerName].trim();
      if (shouldRequireClientApiKey(providerName) && !apiKey) {
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'system',
            'No builder API key is configured. Add one in Settings to continue iterative builds.',
          ),
        );
        return;
      }
      gateway = createRuntimeGateway(llmConfig);
    }

    const guardrailsHeaders = buildPreviewSecurityHeaders();
    const loop = new BuilderLoop({
      gateway,
      contextManager: new ContextManager({
        builder: {
          model: settings.llmModels.builder.model,
          systemPrompt: BUILDER_SYSTEM_PROMPT,
          patchFormat: BUILDER_PATCH_FORMAT,
        },
      }),
      events: {
        onEvent: (event) => {
          if (activeSessionIdRef.current !== requestSessionId) {
            return;
          }
          studioLog({
            level: event.type === 'error' ? 'error' : 'debug',
            source: `builder.event.${event.type}`,
            sessionId: requestSessionId,
            message: `Builder event: ${event.type}`,
            details: event,
          });
          if (event.type === 'phase_changed') {
            useBuildStore.setState((state) => ({
              isPaused: state.isPaused,
              buildState: { ...event.state },
            }));
            return;
          }
          if (event.type === 'error') {
            useBuildStore.setState((state) => ({
              isPaused: state.isPaused,
              buildState: {
                ...state.buildState,
                phase: 'error',
                currentAtom: event.atom,
                lastError: event.message,
                phaseStartedAt: Date.now(),
              },
            }));
          }
        },
      },
      telemetry: {
        onBuildStart: ({ atom, attempt, timestamp }) => {
          void telemetry.recordBuildStart({
            sessionId: requestSessionId,
            workItemId: atom.id,
            attempt,
            timestamp,
          });
        },
        onBuildPreview: ({ durationMs, timestamp }) => {
          void telemetry.recordBuildPreview({
            sessionId: requestSessionId,
            durationMs,
            timestamp,
          });
        },
        onBuildComplete: ({ durationMs, status, errorCategory, timestamp }) => {
          void telemetry.recordBuildComplete({
            sessionId: requestSessionId,
            durationMs,
            status,
            errorCategory,
            timestamp,
          });
        },
      },
    });

    const previewPayloadRef: { current: PreviewSwapPayload | null } = { current: null };
    const backlogController: BacklogController = {
      getOnDeck: () =>
        activeSessionIdRef.current === requestSessionId ? getOnDeckItemFromStore() : null,
      updateItem: (itemId, update) => {
        if (activeSessionIdRef.current !== requestSessionId) {
          return;
        }
        useBacklogStore.getState().updateItem(itemId, update);
      },
      promoteNext: () => {
        if (activeSessionIdRef.current !== requestSessionId) {
          return null;
        }
        useBacklogStore.getState().promoteNext();
        return getOnDeckItemFromStore();
      },
      moveToEnd: (itemId) => {
        if (activeSessionIdRef.current !== requestSessionId) {
          return;
        }
        useBacklogStore.getState().moveToEnd(itemId);
      },
    };
    const previewAdapter = {
      inject: (html: string) => {
        previewPayloadRef.current = { html };
      },
      swap: () => {
        if (!previewPayloadRef.current?.html) {
          return;
        }
        const payload = buildPreviewSwapPayload(vfs, previewPayloadRef.current.html);
        previewPayloadRef.current = payload;
        emitPreviewSwap(payload);
      },
      getInactiveSlot: () =>
        previewActiveSlotRef.current === 'blue' ? 'green' : 'blue',
    };

    builderRunningRef.current = true;
    builderCycleRef.current += 1;
    try {
      const result = await loop.run({
        vfs,
        backlog: backlogController,
        conversation: useChatStore
          .getState()
          .messages.filter((message) => message.sessionId === requestSessionId),
        preview: previewAdapter,
        guardrails: {
          deploy: {
            selectedHost: 'github_pages',
            availableHosts: ['github_pages', 'cloudflare_pages', 'netlify', 'vercel'],
          },
          preview: {
            cspHeader: guardrailsHeaders.csp,
            sriEnabled: guardrailsHeaders.sriRequired,
          },
        },
        isPaused: () => useBuildStore.getState().isPaused,
      });

      if (!result.ok) {
        const surfacedError = getChatErrorMessage(
          providerName,
          result.error,
        );
        studioLog({
          level: 'error',
          source: 'builder.cycle.error',
          sessionId: requestSessionId,
          message: surfacedError || 'Builder loop failed unexpectedly.',
          details: result.error,
        });
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'system',
            surfacedError || 'Builder loop failed unexpectedly.',
          ),
        );
      } else {
        studioLog({
          level: 'debug',
          source: 'builder.cycle.complete',
          sessionId: requestSessionId,
          message: `Builder cycle finished with status "${result.value.status}".`,
          details: {
            workItemId: result.value.atom?.id ?? null,
            attempts: result.value.attempts,
          },
        });
      }
    } finally {
      builderRunningRef.current = false;
    }
  }, [addFocusedMessage, emitPreviewSwap]);

  const runFirstMessageFlow = useCallback(
    async (firstUserMessage: string) => {
      const requestSessionId = activeSessionId;
      const requestId = chatRequestIdRef.current + 1;
      chatRequestIdRef.current = requestId;
      setIsAwaitingChatResponse(true);
      const settings = useSettingsStore.getState().settings;
      const providerName = settings.llmModels.chat.provider;

      studioLog({
        level: 'info',
        source: 'first-message.start',
        sessionId: requestSessionId,
        message: 'Starting first-message preview flow.',
        details: {
          requestId,
          useMock: USE_MOCK_LLM,
          inputLength: firstUserMessage.length,
          provider: providerName,
          model: settings.llmModels.chat.model,
          reasoningEffort:
            providerName === 'openai' ? settings.openaiThinking.chat : undefined,
        },
      });

      const llmConfig = buildLlmConfigFromSettings(settings);
      const telemetry = useTelemetryStore.getState();
      try {
        let gateway: LLMGateway;
        if (USE_MOCK_LLM) {
          gateway = createMockGateway(llmConfig, ({ model, messages }) => {
            const prompt = [...messages].reverse().find((message) => message.role === 'user');
            return buildMockClassificationResponse(prompt?.content ?? '', model);
          });
        } else {
          const apiKey = settings.llmKeys[providerName].trim();
          if (shouldRequireClientApiKey(providerName) && !apiKey) {
            addFocusedMessage(
              buildNarrationMessage(
                requestSessionId,
                'system',
                'No chat API key is configured. Add one in Settings to generate a first preview.',
              ),
            );
            return;
          }
          gateway = createRuntimeGateway(llmConfig);
        }

        const firstPath = new FirstMessagePath({
          gateway,
          templateCatalog: TEMPLATE_CATALOG,
        });
        const firstResult = await firstPath.run(firstUserMessage);

        if (
          chatRequestIdRef.current !== requestId ||
          activeSessionIdRef.current !== requestSessionId
        ) {
          return;
        }

        if (!firstResult.ok) {
          const errorMessage = getChatErrorMessage(providerName, firstResult.error);
          studioLog({
            level: 'error',
            source: 'first-message.error',
            sessionId: requestSessionId,
            message: errorMessage || 'Failed to build the first preview.',
            details: firstResult.error,
          });
          addFocusedMessage(
            buildNarrationMessage(
              requestSessionId,
              'system',
              errorMessage || 'Failed to build the first preview.',
            ),
          );
          return;
        }

        if (firstResult.value.status === 'clarify') {
          studioLog({
            level: 'info',
            source: 'first-message.clarify',
            sessionId: requestSessionId,
            message: 'First-message classifier requested clarification.',
            details: {
              question: firstResult.value.question,
            },
          });
          addFocusedMessage(
            buildNarrationMessage(
              requestSessionId,
              'chat_ai',
              firstResult.value.question,
            ),
          );
          return;
        }

        if (firstResult.value.status === 'scratch') {
          studioLog({
            level: 'info',
            source: 'first-message.scratch',
            sessionId: requestSessionId,
            message: 'First-message classifier selected scratch path.',
          });
          addFocusedMessage(
            buildNarrationMessage(
              requestSessionId,
              'chat_ai',
              'I can start from scratch, but I need a little more direction on layout and content.',
            ),
          );
          return;
        }

        workingVfsRef.current = firstResult.value.vfs;
        sessionPathRef.current = 'template';
        sessionTemplateIdRef.current = firstResult.value.template.id;
        studioLog({
          level: 'info',
          source: 'first-message.preview',
          sessionId: requestSessionId,
          message: 'First preview generated and ready to swap.',
          details: {
            templateId: firstResult.value.template.id,
            previewPath: firstResult.value.preview.pagePath,
            htmlLength: firstResult.value.preview.html.length,
            durationMs: firstResult.value.timing.durationMs,
            withinSla: firstResult.value.timing.withinSla,
          },
        });
        emitPreviewSwap({
          html: firstResult.value.preview.html,
          pagePath: firstResult.value.preview.pagePath,
          routes: firstResult.value.preview.routes,
        });
        void telemetry.recordTemplateSelected({
          sessionId: requestSessionId,
          templateId: firstResult.value.template.id,
          path: 'template',
          timestamp: Date.now(),
        });

        addFocusedMessage(
          buildNarrationMessage(requestSessionId, 'chat_ai', "Here's your first preview!"),
        );
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'chat_ai',
            getMilestoneChatMessage('first_preview', { previewUrl: 'in this panel' }),
          ),
        );

        let backlog: WorkItem[] = [];
        let backlogErrorMessage: string | null = null;
        const backlogStartedAt = Date.now();
        studioLog({
          level: 'debug',
          source: 'first-message.backlog.start',
          sessionId: requestSessionId,
          message: 'Generating initial backlog from first-message classification.',
          details: {
            requestId,
            provider: providerName,
            model: settings.llmModels.chat.model,
          },
        });
        try {
          backlog = await buildInitialBacklog(
            firstResult.value.classification,
            firstResult.value.template,
            USE_MOCK_LLM ? null : gateway,
            providerName,
            requestSessionId,
          );
        } catch (error) {
          backlogErrorMessage =
            error instanceof Error
              ? error.message
              : 'Initial backlog planning failed.';
          studioLog({
            level: 'warn',
            source: 'first-message.backlog.error',
            sessionId: requestSessionId,
            message: backlogErrorMessage,
          });
        }
        if (backlog.length > 0) {
          studioLog({
            level: 'info',
            source: 'first-message.backlog',
            sessionId: requestSessionId,
            message: `Initial backlog created with ${backlog.length} work items.`,
            details: {
              durationMs: Math.max(0, Date.now() - backlogStartedAt),
            },
          });
          setBacklogItems(backlog);
          promoteNext();
        } else if (backlogErrorMessage) {
          const normalized = backlogErrorMessage.toLowerCase();
          const planningMessage = normalized.includes('timed out')
            ? 'First preview is ready. Initial backlog planning timed out, so auto-improvements are paused. Ask for a specific next change and I will continue.'
            : `First preview is ready, but initial backlog planning failed: ${backlogErrorMessage}`;
          addFocusedMessage(
            buildNarrationMessage(
              requestSessionId,
              'system',
              planningMessage,
            ),
          );
        }
      } catch (error) {
        if (
          chatRequestIdRef.current !== requestId ||
          activeSessionIdRef.current !== requestSessionId
        ) {
          return;
        }
        addFocusedMessage(
          buildNarrationMessage(
            requestSessionId,
            'system',
            error instanceof Error
              ? error.message
              : 'Unexpected first-preview error. Please retry.',
          ),
        );
        studioLog({
          level: 'error',
          source: 'first-message.exception',
          sessionId: requestSessionId,
          message:
            error instanceof Error
              ? error.message
              : 'Unexpected first-preview error. Please retry.',
        });
      } finally {
        if (
          chatRequestIdRef.current === requestId &&
          activeSessionIdRef.current === requestSessionId
        ) {
          setIsAwaitingChatResponse(false);
        }
      }
    },
    [
      activeSessionId,
      addFocusedMessage,
      buildInitialBacklog,
      emitPreviewSwap,
      promoteNext,
      setBacklogItems,
    ],
  );

  useEffect(() => {
    if (!hasPreview) {
      return;
    }
    if (isPaused) {
      return;
    }
    if (!onDeckItem) {
      return;
    }
    if (previewHasStaged) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!builderRunningRef.current) {
        void runBuilderCycle();
      }
    }, BUILDER_LOOP_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [buildPhase, hasPreview, isPaused, onDeckItem?.id, previewHasStaged, runBuilderCycle]);

  useEffect(() => {
    if (!hasPreview || isPaused || previewHasStaged) {
      return;
    }
    if (onDeckItem) {
      return;
    }
    if (builderRunningRef.current) {
      return;
    }
    if (autonomousCriticStoppedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!builderRunningRef.current) {
        void runAutonomousCriticCycle();
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [hasPreview, isPaused, onDeckItem, previewHasStaged, runAutonomousCriticCycle]);

  const queueUserRequestAsBacklogItem = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim();
      if (!content) {
        return [];
      }

      const plannedItems = await planUserRequestBacklogItems(content);
      if (plannedItems.length === 0) {
        return [];
      }

      insertItemsAfterActive(plannedItems);
      focusItem(plannedItems[0]?.id ?? null);
      setAutoFocusOnDeck(true);
      studioLog({
        level: 'info',
        source: 'planner.user-request.queued',
        sessionId: activeSessionId,
        message: 'Queued user request behind active work items.',
        details: {
          count: plannedItems.length,
          firstWorkItemId: plannedItems[0]?.id ?? null,
          titles: plannedItems.map((item) => item.title),
        },
      });
      addFocusedMessage(
        buildNarrationMessage(
          activeSessionId,
          'chat_ai',
          plannedItems.length > 1
            ? `I split that into ${plannedItems.length} focused tasks and queued them right after active work.`
            : `Queued: "${plannedItems[0]?.title}". It will run after active work.`,
          plannedItems[0]?.id ?? null,
        ),
      );
      return plannedItems;
    },
    [activeSessionId, addFocusedMessage, focusItem, insertItemsAfterActive, planUserRequestBacklogItems],
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

  const retryBlockedItem = useCallback(
    (item: WorkItem) => {
      updateBacklogItem(item.id, {
        status: 'backlog',
        description: `STRICT RETRY: ${item.description}`,
        blockedCode: undefined,
        blockedReason: undefined,
      });
      setBlockedTrayOpen(false);
      addFocusedMessage(
        buildNarrationMessage(
          activeSessionId,
          'chat_ai',
          `Retry queued for "${item.title}" with stricter instructions.`,
          item.id,
        ),
      );
    },
    [activeSessionId, addFocusedMessage, updateBacklogItem],
  );

  const splitBlockedItem = useCallback(
    (item: WorkItem) => {
      const clauses = splitRequestIntoClauses(item.description);
      const now = Date.now();
      const splitItems: WorkItem[] = clauses.slice(0, 3).map((clause, index) => {
        const atomType = inferAtomTypeFromRequest(clause);
        const title = summarizeUserRequest(clause);
        return {
          id: `split-${now}-${index}-${sanitizeIdentifier(title).slice(0, 30)}`,
          sessionId: activeSessionId,
          title,
          description: clause,
          effort: 'S',
          status: 'backlog',
          order: index + 1,
          dependencies: [],
          rationale: `Split from blocked item "${item.title}".`,
          createdAt: now,
          atomType,
          filesTouch: defaultFilesForAtomType(atomType),
          estimatedLines: 40,
          visibleChange: `Implements: ${title}`,
        };
      });
      if (splitItems.length > 0) {
        insertItemsAfterActive(splitItems);
      }
      updateBacklogItem(item.id, { status: 'done' });
      setBlockedTrayOpen(false);
      addFocusedMessage(
        buildNarrationMessage(
          activeSessionId,
          'chat_ai',
          `Split "${item.title}" into ${Math.max(1, splitItems.length)} smaller tasks.`,
          splitItems[0]?.id ?? item.id,
        ),
      );
    },
    [activeSessionId, addFocusedMessage, insertItemsAfterActive, updateBacklogItem],
  );

  const skipBlockedItem = useCallback(
    (item: WorkItem) => {
      updateBacklogItem(item.id, { status: 'done' });
      addFocusedMessage(
        buildNarrationMessage(
          activeSessionId,
          'chat_ai',
          `Skipped blocked task "${item.title}" for now.`,
          item.id,
        ),
      );
    },
    [activeSessionId, addFocusedMessage, updateBacklogItem],
  );

  const submitChatDraft = useCallback(() => {
    const content = chatDraft.trim();
    if (!content) {
      return false;
    }

    const isFirstUserMessage = sessionMessages.every(
      (message) => message.sender !== 'user',
    );
    addFocusedMessage(buildNarrationMessage(activeSessionId, 'user', content));
    setChatDraft('');
    if (isFirstUserMessage) {
      void runFirstMessageFlow(content);
      return true;
    }

    if (hasPreview) {
      autonomousCriticStoppedRef.current = false;
      void queueUserRequestAsBacklogItem(content);
      return true;
    }

    void requestChatResponse();
    return true;
  }, [
    activeSessionId,
    addFocusedMessage,
    chatDraft,
    hasPreview,
    queueUserRequestAsBacklogItem,
    requestChatResponse,
    runFirstMessageFlow,
    sessionMessages,
  ]);

  const activateTelemetrySession = useCallback(
    async (
      sessionId: string,
      options: {
        path: TelemetrySessionPath;
        rehydrate?: boolean;
        startedAt?: number;
      },
    ) => {
      const telemetry = useTelemetryStore.getState();
      if (telemetry.sessionId && telemetry.sessionId !== sessionId) {
        await telemetry.endSession({ endedAt: Date.now() });
      }

      const loaded = await telemetry.loadEvents(sessionId);
      if (!loaded) {
        telemetry.setSessionId(sessionId);
      }

      const next = useTelemetryStore.getState();
      const lastEvent = next.events[next.events.length - 1];
      const hasOpenSession =
        next.sessionId === sessionId &&
        next.sessionStartedAt !== null &&
        lastEvent?.event !== 'session.end';

      if (!hasOpenSession) {
        await next.startSession({
          sessionId,
          path: options.path,
          startedAt: options.startedAt,
        });
      }
    },
    [],
  );

  const buildCheckpointState = useCallback((): StudioState | null => {
    const vfs = workingVfsRef.current;
    if (!vfs) {
      return null;
    }

    const settings = useSettingsStore.getState().settings;
    const llmConfig = buildLlmConfigFromSettings(settings);
    const telemetry = useTelemetryStore.getState();
    const totalCost = buildSessionCostSummary(telemetry.events, activeSessionId).totalCost;

    const session: Session = {
      id: activeSessionId,
      createdAt: sessionCreatedAtRef.current,
      path: sessionPathRef.current,
      templateId: sessionTemplateIdRef.current,
      status: 'active',
      llmConfig,
      totalCost,
    };

    return {
      session,
      conversation: useChatStore
        .getState()
        .messages.filter((message) => message.sessionId === activeSessionId),
      backlog: useBacklogStore.getState().items,
      vfs,
      buildState: useBuildStore.getState().buildState,
      deployments: [],
      telemetry: telemetry.events.filter((event) => event.sessionId === activeSessionId),
      llmConfig,
    };
  }, [activeSessionId]);

  const saveCheckpoint = useCallback(
    async (reason: string) => {
      const state = buildCheckpointState();
      if (!state) {
        return;
      }
      const checkpoint = new SessionCheckpoint();
      const result = await checkpoint.save(state);
      if (!result.ok) {
        studioLog({
          level: 'warn',
          source: 'checkpoint.save.failed',
          sessionId: activeSessionId,
          message: 'Checkpoint autosave failed.',
          details: {
            reason,
            error: result.error,
          },
        });
      }
    },
    [activeSessionId, buildCheckpointState],
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
    if (telemetryInitializedRef.current) {
      return;
    }
    if (!recoveryChecked || recoveryState) {
      return;
    }
    telemetryInitializedRef.current = true;
    void activateTelemetrySession(activeSessionId, {
      path: 'scratch',
      startedAt: Date.now(),
    });
  }, [activeSessionId, activateTelemetrySession, recoveryChecked, recoveryState]);

  const latestSessionMessageTs =
    sessionMessages.length > 0 ? sessionMessages[sessionMessages.length - 1]?.timestamp : 0;

  useEffect(() => {
    if (!recoveryChecked || isRecoveryOpen) {
      return;
    }
    if (!workingVfsRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveCheckpoint('state-change');
    }, CHECKPOINT_CHANGE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    activeSessionId,
    backlogItems,
    buildPhase,
    hasPreview,
    isRecoveryOpen,
    latestSessionMessageTs,
    previewHasStaged,
    recoveryChecked,
    saveCheckpoint,
  ]);

  useEffect(() => {
    if (!recoveryChecked) {
      return;
    }
    const timer = window.setInterval(() => {
      void saveCheckpoint('interval');
    }, CHECKPOINT_AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [recoveryChecked, saveCheckpoint]);

  useEffect(() => {
    const flush = () => {
      void saveCheckpoint('lifecycle');
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [saveCheckpoint]);

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
      .filter((item) => item.status === 'backlog' && item.id !== onDeckItem?.id)
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
  const blockedItems = useMemo(
    () => backlogItems.filter((item) => item.status === 'blocked'),
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
  const composerHint = focusedItem
    ? `Ask about ${focusedItem.title}...`
    : 'Type your next instruction...';
  const canSendDraft = chatDraft.trim().length > 0;
  const sessionCostSummary = useMemo(() => {
    const activeSummary = buildSessionCostSummary(telemetryEvents, activeSessionId);
    if (activeSummary.roles.length > 0) {
      return activeSummary;
    }

    if (telemetrySessionId && telemetrySessionId !== activeSessionId) {
      const telemetrySummary = buildSessionCostSummary(telemetryEvents, telemetrySessionId);
      if (telemetrySummary.roles.length > 0) {
        return telemetrySummary;
      }
    }

    const latestResponseSessionId = [...telemetryEvents]
      .reverse()
      .find((event) => event.event === 'llm.response')?.sessionId;
    if (latestResponseSessionId) {
      return buildSessionCostSummary(telemetryEvents, latestResponseSessionId);
    }

    return activeSummary;
  }, [activeSessionId, telemetryEvents, telemetrySessionId]);

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
      const loweredError = (buildError ?? '').toLowerCase();
      const shouldBlock =
        loweredError.includes('intent validation failed') ||
        loweredError.includes('exceeded') ||
        loweredError.includes('color change');
      if (shouldBlock) {
        if (current.status !== 'blocked') {
          updateBacklogItem(current.id, {
            status: 'blocked',
            blockedCode: 'intent_unmet',
            blockedReason: buildError ?? 'Validation failed repeatedly.',
          });
        }
        return;
      }
      if (current.status !== 'backlog') {
        updateBacklogItem(current.id, {
          status: 'backlog',
          blockedCode: undefined,
          blockedReason: undefined,
        });
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
    buildError,
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
    if (import.meta.env.MODE !== 'e2e') {
      seededMessagesRef.current = true;
      return;
    }
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
      setMessages(buildSampleMessages(activeSessionId));
    }
  }, [activeSessionId, messages.length, recoveryChecked, recoveryState, setMessages]);

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
    const nextSessionId = createSessionId();
    const checkpoint = new SessionCheckpoint();
    await checkpoint.clear();
    resetChlorastroliteSession();
    clearMessages();
    setChatDraft('');
    clearBacklog();
    resetBuild();
    resetTransientUi();
    narrationRef.current = null;
    sessionCreatedAtRef.current = Date.now();
    sessionPathRef.current = 'scratch';
    sessionTemplateIdRef.current = undefined;
    setActiveSessionId(nextSessionId);
    telemetryInitializedRef.current = true;
    await activateTelemetrySession(nextSessionId, {
      path: 'scratch',
      startedAt: Date.now(),
    });
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

    const { session, backlog, conversation, vfs: vfsSnapshot } = loadResult.value;
    sessionCreatedAtRef.current = session.createdAt;
    sessionPathRef.current = session.path;
    sessionTemplateIdRef.current = session.templateId;
    setActiveSessionId(session.id);
    telemetryInitializedRef.current = true;
    await activateTelemetrySession(session.id, {
      path: session.path,
      rehydrate: true,
      startedAt: session.createdAt,
    });
    setMessages(conversation);
    setChatDraft('');
    setBacklogItems(backlog);
    const restoredVfs = hydrateVfsFromSnapshot(vfsSnapshot);
    workingVfsRef.current = restoredVfs;
    const restoredPreview = buildPreviewHtml(restoredVfs);
    if (restoredPreview.ok) {
      emitPreviewSwap({
        html: restoredPreview.value.html,
        pagePath: restoredPreview.value.pagePath,
        routes: buildPreviewRouteMap(restoredVfs),
      });
    }
    resetBuild();
    resetTransientUi();
    narrationRef.current = null;
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
        costTotal={sessionCostSummary.totalCost}
        costRoles={sessionCostSummary.roles}
        hasUnknownModel={sessionCostSummary.hasUnknownModel}
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
      {blockedTrayOpen && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close blocked tray"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setBlockedTrayOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-[min(460px,92vw)] overflow-y-auto border-l border-slate-800/80 bg-slate-950/95 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.6)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-['JetBrains_Mono'] text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">
                Blocked Tasks
              </h3>
              <button
                type="button"
                onClick={() => setBlockedTrayOpen(false)}
                className="rounded-full border border-slate-800/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300"
              >
                Close
              </button>
            </div>
            {blockedItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800/80 bg-slate-900/50 p-3 text-xs text-slate-400">
                No blocked tasks.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {blockedItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3"
                  >
                    <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                    <div className="mt-1 text-[11px] text-slate-300">
                      {item.blockedReason ?? 'Validation failed repeatedly.'}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => retryBlockedItem(item)}
                        className="rounded-full border border-emerald-300/50 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200"
                      >
                        Retry stricter
                      </button>
                      <button
                        type="button"
                        onClick={() => splitBlockedItem(item)}
                        className="rounded-full border border-sky-300/50 bg-sky-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-sky-200"
                      >
                        Split
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          focusItem(item.id);
                          setBlockedTrayOpen(false);
                        }}
                        className="rounded-full border border-slate-700/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300"
                      >
                        Edit request
                      </button>
                      <button
                        type="button"
                        onClick={() => skipBlockedItem(item)}
                        className="rounded-full border border-rose-300/50 bg-rose-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-rose-200"
                      >
                        Skip for now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      <main className="relative z-10 mx-auto w-full max-w-[1800px] px-4 pb-10 pt-20">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section
            aria-label="Chat panel"
            className={`${workPanelShell} order-2 lg:order-2`}
          >
            <header className="flex items-center justify-between">
              <h2 className="font-['JetBrains_Mono'] text-lg font-bold uppercase tracking-[0.22em] text-slate-100">
                {panels[0].label}
              </h2>
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full bg-emerald-300/90 shadow-[0_0_10px_rgba(16,185,129,0.6)]"
              />
            </header>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/50">
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
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
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
                  <form
                    className="flex items-end gap-3 rounded-2xl border border-slate-800/70 bg-slate-900/70 px-3 py-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!submitChatDraft()) {
                        return;
                      }
                      requestAnimationFrame(() => {
                        composerRef.current?.focus();
                      });
                    }}
                  >
                    <span className="mb-2 h-2 w-2 rounded-full bg-emerald-300/80" />
                    <label htmlFor="chat-composer" className="sr-only">
                      Chat composer
                    </label>
                    <textarea
                      ref={composerRef}
                      id="chat-composer"
                      data-chat-input="true"
                      value={chatDraft}
                      rows={1}
                      aria-label="Chat composer"
                      placeholder={composerHint}
                      className="min-h-[2.25rem] max-h-32 flex-1 resize-y bg-transparent text-sm text-slate-100 placeholder:text-xs placeholder:uppercase placeholder:tracking-[0.2em] placeholder:text-slate-500 focus:outline-none"
                      onChange={(event) => {
                        setChatDraft(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' || event.shiftKey) {
                          return;
                        }
                        event.preventDefault();
                        if (!submitChatDraft()) {
                          return;
                        }
                        requestAnimationFrame(() => {
                          composerRef.current?.focus();
                        });
                      }}
                    />
                    <button
                      type="submit"
                      data-chat-input="true"
                      disabled={!canSendDraft}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                        canSendDraft
                          ? 'border border-emerald-300/70 bg-emerald-300/90 text-slate-950 hover:bg-emerald-200'
                          : 'cursor-not-allowed border border-slate-700/80 bg-slate-800/80 text-slate-500'
                      }`}
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="Preview panel"
            className={`${previewPanelShell} order-1 lg:order-1 lg:col-span-2`}
          >
            <PreviewPanel
              key={previewResetKey}
              label={panels[1].label}
              sessionId={activeSessionId}
              automationPaused={previewAutomationPaused}
              onToggleAutomationPause={() =>
                setPreviewAutomationPaused((current) => !current)
              }
            />
          </section>

          <section
            aria-label="Backlog panel"
            className={`${workPanelShell} order-3 lg:order-3`}
          >
            <header className="flex items-center justify-between">
              <h2 className="font-['JetBrains_Mono'] text-lg font-bold uppercase tracking-[0.22em] text-slate-100">
                {panels[2].label}
              </h2>
              <div className="flex items-center gap-2">
                {isPaused && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-amber-200">
                    Paused
                  </span>
                )}
                <button
                  type="button"
                  onClick={togglePause}
                  className="rounded-full border border-slate-800/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300 transition hover:border-emerald-300/70 hover:text-emerald-200"
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  onClick={() => setBlockedTrayOpen(true)}
                  className="rounded-full border border-slate-800/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300 transition hover:border-rose-300/70 hover:text-rose-200"
                >
                  Blocked {blockedItems.length}
                </button>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {onDeckItem ? (
                  <div
                    className={`rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/70 to-slate-950/80 p-3 shadow-[0_10px_22px_rgba(15,23,42,0.4)] ${
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
                    <h3 className="mt-1.5 line-clamp-1 text-sm font-semibold text-slate-100">
                      {onDeckItem.title}
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-300">
                      {onDeckItem.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-slate-400">
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
                    <div className="mt-1.5 line-clamp-1 text-[11px] text-slate-300">
                      {onDeckItem.visibleChange}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-800/80 bg-slate-950/40 p-3 text-sm text-slate-400">
                    <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-500">
                      On Deck
                    </div>
                    <p className="mt-1 text-slate-300">
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
                      className={`flex flex-col gap-2 ${
                        isPaused ? 'opacity-70' : ''
                      } ${revertPulse ? 'animate-backlog-revert' : ''}`}
                    >
                      {queueItems.map((item, index) => {
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
                            className={`rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 transition ${
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
                                <h4 className="mt-1.5 text-sm font-semibold leading-tight text-slate-100">
                                  {item.title}
                                </h4>
                                <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-slate-300">
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
                            <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500">
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
          {runtimeConfig.logViewerEnabled && (
            <section
              aria-label="Log viewer panel"
              className={`${logsPanelShell} order-4 lg:order-4 lg:col-span-2`}
            >
              <LogViewerPanel
                label={panels[3].label}
              />
            </section>
          )}
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
