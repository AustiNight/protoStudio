import { create } from 'zustand';

import {
  clearTelemetrySessionId,
  readTelemetrySessionId,
  writeTelemetrySessionId,
} from '../persistence/telemetry-session';
import { TelemetryLog } from '../persistence/telemetry-log';
import type {
  LLMError,
  LLMGatewayTelemetry,
  LLMModelSelection,
  LLMRequest,
  LLMResponse,
} from '../types/llm';
import type {
  TelemetryBuildErrorCategory,
  TelemetryBuildStatus,
  TelemetryDeployErrorReason,
  TelemetryDeployHost,
  TelemetryDeployStatus,
  TelemetryEvent,
  TelemetryEventDataMap,
  TelemetryEventName,
  TelemetryExportBundle,
  TelemetryLLMRole,
  TelemetryMessageRole,
  TelemetrySessionPath,
  TelemetrySwapSlot,
  TelemetryTemplateInvalidationReason,
} from '../types/telemetry';

export interface TelemetryTotals {
  total: number;
  byEvent: Record<string, number>;
}

export interface TelemetryCounters {
  messageCount: number;
  backlogCount: number;
  buildCount: number;
  deployCount: number;
}

export interface SessionCostModelBreakdown {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  unknown?: boolean;
}

export interface SessionCostRoleBreakdown {
  role: TelemetryLLMRole;
  cost: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  models: SessionCostModelBreakdown[];
}

export interface SessionCostSummary {
  totalCost: number;
  roles: SessionCostRoleBreakdown[];
  hasUnknownModel: boolean;
}

export interface TelemetryStoreState {
  sessionId: string | null;
  sessionStartedAt: number | null;
  counters: TelemetryCounters;
  events: TelemetryEvent[];
  setSessionId: (sessionId: string | null) => void;
  startSession: (input: {
    sessionId: string;
    path: TelemetrySessionPath;
    templateId?: string;
    startedAt?: number;
  }) => Promise<boolean>;
  endSession: (input?: { endedAt?: number }) => Promise<boolean>;
  recordMessage: (input: {
    sessionId?: string;
    role: TelemetryMessageRole;
    charCount: number;
    timestamp?: number;
  }) => Promise<boolean>;
  recordBacklogCount: (input: {
    sessionId?: string;
    count: number;
    timestamp?: number;
  }) => Promise<boolean>;
  recordBacklogAdded: (input: {
    sessionId?: string;
    count: number;
    timestamp?: number;
  }) => Promise<boolean>;
  recordBuildStart: (input: {
    sessionId?: string;
    workItemId?: string;
    attempt?: number;
    timestamp?: number;
  }) => Promise<boolean>;
  recordBuildPreview: (input: {
    sessionId?: string;
    durationMs: number;
    timestamp?: number;
  }) => Promise<boolean>;
  recordBuildComplete: (input: {
    sessionId?: string;
    durationMs: number;
    status: TelemetryBuildStatus;
    errorCategory?: TelemetryBuildErrorCategory;
    timestamp?: number;
  }) => Promise<boolean>;
  recordBuildSwap: (input: {
    sessionId?: string;
    slot: TelemetrySwapSlot;
    timestamp?: number;
  }) => Promise<boolean>;
  recordDeployStart: (input: {
    sessionId?: string;
    host: TelemetryDeployHost;
    timestamp?: number;
  }) => Promise<boolean>;
  recordDeployComplete: (input: {
    sessionId?: string;
    host: TelemetryDeployHost;
    status: TelemetryDeployStatus;
    durationMs: number;
    siteSize: number;
    fileCount: number;
    timestamp?: number;
  }) => Promise<boolean>;
  recordDeployError: (input: {
    sessionId?: string;
    host: TelemetryDeployHost;
    reason: TelemetryDeployErrorReason;
    timestamp?: number;
  }) => Promise<boolean>;
  recordTemplateSelected: (input: {
    sessionId?: string;
    templateId: string;
    path: TelemetrySessionPath;
    timestamp?: number;
  }) => Promise<boolean>;
  recordTemplateInvalidated: (input: {
    sessionId?: string;
    templateId: string;
    reason: TelemetryTemplateInvalidationReason;
    timestamp?: number;
  }) => Promise<boolean>;
  createGatewayTelemetry: () => LLMGatewayTelemetry;
  appendEvent: (event: TelemetryEvent) => Promise<boolean>;
  loadEvents: (sessionId: string) => Promise<boolean>;
  exportEvents: (sessionId?: string) => Promise<string | null>;
  exportBundle: (sessionId?: string) => Promise<string | null>;
  clearEvents: () => Promise<boolean>;
  getTotals: () => TelemetryTotals;
  resetStore: () => void;
}

const telemetryLog = new TelemetryLog();

export const createTelemetryStore = () => {
  const storedSessionId = readTelemetrySessionId();

  return create<TelemetryStoreState>((set, get) => {
    const appendEventInternal = async (event: TelemetryEvent): Promise<boolean> => {
      const result = await telemetryLog.append(event);
      if (!result.ok) {
        return false;
      }

      set((state) => {
        const updates = applyTelemetryEvent(state, event);
        const isNewSession =
          event.event === 'session.start' && event.sessionId !== state.sessionId;
        const nextEvents = isNewSession ? [event] : [...state.events, event];
        const sessionId = updates.sessionId ?? state.sessionId ?? event.sessionId;

        return {
          ...state,
          ...updates,
          sessionId,
          events: nextEvents,
        };
      });

      return true;
    };

    if (storedSessionId) {
      void (async () => {
        const result = await telemetryLog.getEvents(storedSessionId);
        if (result.ok) {
          const snapshot = deriveTelemetrySnapshot(result.value);
          set({
            sessionId: storedSessionId,
            sessionStartedAt: snapshot.sessionStartedAt,
            counters: snapshot.counters,
            events: result.value,
          });
        }
      })();
    }

    return {
      sessionId: storedSessionId,
      sessionStartedAt: null,
      counters: buildEmptyCounters(),
      events: [],
      setSessionId: (sessionId) => {
        if (sessionId) {
          writeTelemetrySessionId(sessionId);
        } else {
          clearTelemetrySessionId();
        }
        set(() => ({
          sessionId,
        }));
      },
      startSession: async ({ sessionId, path, templateId, startedAt }) => {
        writeTelemetrySessionId(sessionId);
        const timestamp = startedAt ?? Date.now();
        return appendEventInternal(
          buildTelemetryEvent(sessionId, timestamp, 'session.start', {
            path,
            templateId,
          }),
        );
      },
      endSession: async (input) => {
        const state = get();
        const sessionId = state.sessionId;
        if (!sessionId || state.sessionStartedAt === null) {
          return false;
        }
        const endedAt = input?.endedAt ?? Date.now();
        const durationMs = Math.max(0, endedAt - state.sessionStartedAt);
        return appendEventInternal(
          buildTelemetryEvent(sessionId, endedAt, 'session.end', {
            durationMs,
            messageCount: state.counters.messageCount,
            backlogCount: state.counters.backlogCount,
            buildCount: state.counters.buildCount,
            deployCount: state.counters.deployCount,
          }),
        );
      },
      recordMessage: async ({ sessionId, role, charCount, timestamp }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        const safeCount = Math.max(0, Math.floor(charCount));
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'session.message',
            {
              role,
              charCount: safeCount,
            },
          ),
        );
      },
      recordBacklogCount: async ({ sessionId, count, timestamp }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        const safeCount = Math.max(0, Math.floor(count));
        const current = get().counters.backlogCount;
        if (safeCount === current) {
          return true;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'session.backlog',
            {
              itemCount: safeCount,
            },
          ),
        );
      },
      recordBacklogAdded: async ({ sessionId, count, timestamp }) => {
        if (count <= 0) {
          return false;
        }
        const nextCount = get().counters.backlogCount + count;
        return get().recordBacklogCount({
          sessionId,
          count: nextCount,
          timestamp,
        });
      },
      recordBuildStart: async ({ sessionId, workItemId, attempt, timestamp }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'build.start',
            {
              workItemId,
              attempt,
            },
          ),
        );
      },
      recordBuildPreview: async ({ sessionId, durationMs, timestamp }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'build.preview',
            {
              durationMs: Math.max(0, durationMs),
            },
          ),
        );
      },
      recordBuildComplete: async ({
        sessionId,
        durationMs,
        status,
        errorCategory,
        timestamp,
      }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'build.complete',
            {
              durationMs: Math.max(0, durationMs),
              status,
              errorCategory,
            },
          ),
        );
      },
      recordBuildSwap: async ({ sessionId, slot, timestamp }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'build.swap',
            {
              slot,
            },
          ),
        );
      },
      recordDeployStart: async ({ sessionId, host, timestamp }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'deploy.start',
            {
              host,
            },
          ),
        );
      },
      recordDeployComplete: async ({
        sessionId,
        host,
        status,
        durationMs,
        siteSize,
        fileCount,
        timestamp,
      }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'deploy.complete',
            {
              host,
              status,
              durationMs: Math.max(0, durationMs),
              siteSize,
              fileCount,
            },
          ),
        );
      },
      recordDeployError: async ({ sessionId, host, reason, timestamp }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'deploy.error',
            {
              host,
              reason,
            },
          ),
        );
      },
      recordTemplateSelected: async ({
        sessionId,
        templateId,
        path,
        timestamp,
      }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'template.selected',
            {
              templateId,
              path,
            },
          ),
        );
      },
      recordTemplateInvalidated: async ({
        sessionId,
        templateId,
        reason,
        timestamp,
      }) => {
        const resolvedSessionId = resolveSessionId(sessionId, get());
        if (!resolvedSessionId) {
          return false;
        }
        return appendEventInternal(
          buildTelemetryEvent(
            resolvedSessionId,
            timestamp ?? Date.now(),
            'template.invalidated',
            {
              templateId,
              reason,
            },
          ),
        );
      },
      createGatewayTelemetry: () => {
        const selectionByRole = new Map<LLMRequest['role'], LLMModelSelection>();
        const handleRequest = async (
          request: LLMRequest,
          selection: LLMModelSelection,
        ) => {
          const resolvedSessionId = resolveSessionId(undefined, get());
          if (!resolvedSessionId) {
            return;
          }
          selectionByRole.set(request.role, selection);
          await appendEventInternal(
            buildTelemetryEvent(
              resolvedSessionId,
              Date.now(),
              'llm.request',
              {
                role: request.role,
                provider: selection.provider.name,
                model: selection.model,
                maxTokens: request.maxTokens,
                temperature: request.temperature,
              },
            ),
          );
        };

        const handleResponse = async (request: LLMRequest, response: LLMResponse) => {
          const resolvedSessionId = resolveSessionId(undefined, get());
          const selection = selectionByRole.get(request.role);
          if (!resolvedSessionId) {
            return;
          }
          if (!selection) {
            return;
          }
          await appendEventInternal(
            buildTelemetryEvent(
              resolvedSessionId,
              Date.now(),
              'llm.response',
              {
                role: request.role,
                provider: selection.provider.name,
                model: selection.model,
                promptTokens: response.usage.promptTokens,
                completionTokens: response.usage.completionTokens,
                cost: response.cost,
                latencyMs: response.latencyMs,
                unknownModel: response.unknownModel,
              },
            ),
          );
        };

        const handleError = async (request: LLMRequest, error: LLMError) => {
          const resolvedSessionId = resolveSessionId(undefined, get());
          if (!resolvedSessionId) {
            return;
          }
          await appendEventInternal(
            buildTelemetryEvent(
              resolvedSessionId,
              Date.now(),
              'llm.error',
              {
                role: request.role,
                provider: error.provider,
                code: error.code,
                status: error.status,
              },
            ),
          );
        };

        return {
          onRequest: handleRequest,
          onResponse: handleResponse,
          onError: handleError,
        } satisfies LLMGatewayTelemetry;
      },
      appendEvent: appendEventInternal,
      loadEvents: async (sessionId) => {
        const result = await telemetryLog.getEvents(sessionId);
        if (!result.ok) {
          return false;
        }
        const snapshot = deriveTelemetrySnapshot(result.value);
        set(() => ({
          sessionId,
          sessionStartedAt: snapshot.sessionStartedAt,
          counters: snapshot.counters,
          events: result.value,
        }));
        return true;
      },
      exportEvents: async (sessionId) => {
        const activeSessionId = sessionId ?? get().sessionId;
        if (!activeSessionId) {
          return null;
        }
        const result = await telemetryLog.exportAsJSON(activeSessionId);
        return result.ok ? result.value : null;
      },
      exportBundle: async (sessionId) => {
        const activeSessionId = sessionId ?? get().sessionId;
        if (!activeSessionId) {
          return null;
        }
        const eventsResult = await telemetryLog.getEvents(activeSessionId);
        if (!eventsResult.ok) {
          return null;
        }
        const bundle: TelemetryExportBundle = {
          sessionId: activeSessionId,
          exportedAt: Date.now(),
          eventCount: eventsResult.value.length,
          events: eventsResult.value,
        };
        return JSON.stringify(bundle, null, 2);
      },
      clearEvents: async () => {
        const activeSessionId = get().sessionId;
        if (activeSessionId) {
          const result = await telemetryLog.clear(activeSessionId);
          if (!result.ok) {
            return false;
          }
        }
        set(() => ({
          events: [],
          sessionStartedAt: null,
          counters: buildEmptyCounters(),
        }));
        return true;
      },
      getTotals: () => buildTotals(get().events),
      resetStore: () => {
        clearTelemetrySessionId();
        set(() => ({
          sessionId: null,
          sessionStartedAt: null,
          counters: buildEmptyCounters(),
          events: [],
        }));
      },
    };
  });
};

export const useTelemetryStore = createTelemetryStore();

export const selectTelemetryEvents = (state: TelemetryStoreState) => state.events;
export const selectTelemetryCount = (state: TelemetryStoreState) => state.events.length;
export const selectTelemetryTotals = (state: TelemetryStoreState) =>
  buildTotals(state.events);

const TELEMETRY_ROLE_ORDER: TelemetryLLMRole[] = ['chat', 'builder'];

type MutableRoleSummary = Omit<SessionCostRoleBreakdown, 'models'> & {
  models: Map<string, SessionCostModelBreakdown>;
};

export function buildSessionCostSummary(
  events: TelemetryEvent[],
  sessionId: string | null,
): SessionCostSummary {
  if (!sessionId) {
    return {
      totalCost: 0,
      roles: [],
      hasUnknownModel: false,
    };
  }

  const rolesByName = new Map<TelemetryLLMRole, MutableRoleSummary>();

  for (const event of events) {
    if (event.event !== 'llm.response' || event.sessionId !== sessionId) {
      continue;
    }
    const role = event.data.role;
    const existingRole = rolesByName.get(role);
    const roleSummary: MutableRoleSummary =
      existingRole ??
      ({
        role,
        cost: 0,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        models: new Map<string, SessionCostModelBreakdown>(),
      } satisfies MutableRoleSummary);

    roleSummary.cost += event.data.cost;
    roleSummary.calls += 1;
    roleSummary.promptTokens += event.data.promptTokens;
    roleSummary.completionTokens += event.data.completionTokens;

    const existingModel = roleSummary.models.get(event.data.model);
    const modelSummary: SessionCostModelBreakdown =
      existingModel ?? {
        model: event.data.model,
        cost: 0,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        unknown: false,
      };
    modelSummary.cost += event.data.cost;
    modelSummary.calls += 1;
    modelSummary.promptTokens += event.data.promptTokens;
    modelSummary.completionTokens += event.data.completionTokens;
    modelSummary.unknown = modelSummary.unknown || event.data.unknownModel;

    roleSummary.models.set(event.data.model, modelSummary);
    rolesByName.set(role, roleSummary);
  }

  const roles: SessionCostRoleBreakdown[] = [];
  for (const role of TELEMETRY_ROLE_ORDER) {
    const summary = rolesByName.get(role);
    if (!summary) {
      continue;
    }
    const models = Array.from(summary.models.values()).sort(
      (left, right) =>
        right.cost - left.cost ||
        right.calls - left.calls ||
        left.model.localeCompare(right.model),
    );
    roles.push({
      role: summary.role,
      cost: summary.cost,
      calls: summary.calls,
      promptTokens: summary.promptTokens,
      completionTokens: summary.completionTokens,
      models,
    });
  }

  const totalCost = roles.reduce((total, role) => total + role.cost, 0);
  const hasUnknownModel = roles.some((role) =>
    role.models.some((model) => model.unknown),
  );

  return {
    totalCost,
    roles,
    hasUnknownModel,
  };
}

function buildTotals(events: TelemetryEvent[]): TelemetryTotals {
  const byEvent: Record<string, number> = {};
  for (const event of events) {
    byEvent[event.event] = (byEvent[event.event] ?? 0) + 1;
  }
  return {
    total: events.length,
    byEvent,
  };
}

function buildEmptyCounters(): TelemetryCounters {
  return {
    messageCount: 0,
    backlogCount: 0,
    buildCount: 0,
    deployCount: 0,
  };
}

function applyTelemetryEvent(
  state: Pick<TelemetryStoreState, 'sessionId' | 'sessionStartedAt' | 'counters'>,
  event: TelemetryEvent,
): Partial<Pick<TelemetryStoreState, 'sessionId' | 'sessionStartedAt' | 'counters'>> {
  if (event.event === 'session.start') {
    return {
      sessionId: event.sessionId,
      sessionStartedAt: event.timestamp,
      counters: buildEmptyCounters(),
    };
  }

  if (state.sessionId && event.sessionId !== state.sessionId) {
    return {};
  }

  switch (event.event) {
    case 'session.message':
      return {
        counters: {
          ...state.counters,
          messageCount: state.counters.messageCount + 1,
        },
      };
    case 'session.backlog':
      return {
        counters: {
          ...state.counters,
          backlogCount: event.data.itemCount,
        },
      };
    case 'build.start':
      return {
        counters: {
          ...state.counters,
          buildCount: state.counters.buildCount + 1,
        },
      };
    case 'deploy.start':
      return {
        counters: {
          ...state.counters,
          deployCount: state.counters.deployCount + 1,
        },
      };
    default:
      return {};
  }
}

function deriveTelemetrySnapshot(events: TelemetryEvent[]): {
  sessionStartedAt: number | null;
  counters: TelemetryCounters;
} {
  let sessionStartedAt: number | null = null;
  let counters = buildEmptyCounters();

  for (const event of events) {
    if (event.event === 'session.start') {
      sessionStartedAt = event.timestamp;
      counters = buildEmptyCounters();
      continue;
    }

    switch (event.event) {
      case 'session.message':
        counters = {
          ...counters,
          messageCount: counters.messageCount + 1,
        };
        break;
      case 'session.backlog':
        counters = {
          ...counters,
          backlogCount: event.data.itemCount,
        };
        break;
      case 'build.start':
        counters = {
          ...counters,
          buildCount: counters.buildCount + 1,
        };
        break;
      case 'deploy.start':
        counters = {
          ...counters,
          deployCount: counters.deployCount + 1,
        };
        break;
      default:
        break;
    }
  }

  return { sessionStartedAt, counters };
}

function resolveSessionId(
  sessionId: string | undefined,
  state: Pick<TelemetryStoreState, 'sessionId'>,
): string | null {
  return sessionId ?? state.sessionId ?? null;
}

function buildTelemetryEvent<E extends TelemetryEventName>(
  sessionId: string,
  timestamp: number,
  event: E,
  data: TelemetryEventDataMap[E],
): TelemetryEvent {
  return {
    sessionId,
    timestamp,
    event,
    data,
  };
}
