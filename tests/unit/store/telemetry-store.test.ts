import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';

import { resetStudioDbForTests, STUDIO_DB_NAME } from '../../../src/persistence/db';
import {
  buildSessionCostSummary,
  createTelemetryStore,
} from '../../../src/store/telemetry-store';
import type { LLMModelSelection, LLMRequest, LLMResponse } from '../../../src/types/llm';
import type { TelemetryEvent, TelemetryExportBundle } from '../../../src/types/telemetry';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function installLocalStorage(storage: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });
}

function buildSelection(): LLMModelSelection {
  return {
    provider: {
      name: 'openai',
      apiKey: 'sk-proj-1234567890ABCDEFXYZ987654321',
      models: ['gpt-4o-mini'],
    },
    model: 'gpt-4o-mini',
  };
}

function buildRequest(): LLMRequest {
  return {
    role: 'chat',
    systemPrompt: 'System prompt',
    messages: [],
    responseFormat: 'text',
    maxTokens: 120,
    temperature: 0.2,
  };
}

function buildResponse(): LLMResponse {
  return {
    content: 'ok',
    usage: { promptTokens: 10, completionTokens: 5 },
    model: 'gpt-4o-mini',
    latencyMs: 150,
    cost: 0.01,
    unknownModel: false,
  };
}

function buildLlmResponseEvent(input: {
  sessionId: string;
  role: 'chat' | 'builder';
  model: string;
  cost: number;
  unknownModel?: boolean;
  timestamp: number;
}): TelemetryEvent {
  return {
    timestamp: input.timestamp,
    sessionId: input.sessionId,
    event: 'llm.response' as const,
    data: {
      role: input.role,
      provider: input.role === 'chat' ? 'openai' : 'anthropic',
      model: input.model,
      promptTokens: 120,
      completionTokens: 60,
      cost: input.cost,
      latencyMs: 180,
      unknownModel: input.unknownModel ?? false,
    },
  };
}

describe('telemetry-store', () => {
  beforeEach(async () => {
    resetStudioDbForTests();
    await deleteDB(STUDIO_DB_NAME);
    installLocalStorage(new MemoryStorage());
  });

  it('records session activity and exports bundle', async () => {
    const store = createTelemetryStore();

    const started = await store.getState().startSession({
      sessionId: 'session-1',
      path: 'template',
      templateId: 'marketing',
      startedAt: 1000,
    });
    expect(started).toBe(true);

    await store.getState().recordMessage({
      sessionId: 'session-1',
      role: 'user',
      charCount: 12,
      timestamp: 1100,
    });
    await store.getState().recordBacklogAdded({
      sessionId: 'session-1',
      count: 2,
      timestamp: 1200,
    });
    await store.getState().recordBuildStart({
      sessionId: 'session-1',
      workItemId: 'WI-1',
      attempt: 1,
      timestamp: 1300,
    });
    await store.getState().recordDeployStart({
      sessionId: 'session-1',
      host: 'github_pages',
      timestamp: 1400,
    });
    await store.getState().endSession({ endedAt: 2000 });

    const events = store.getState().events;
    expect(events.map((event) => event.event)).toEqual([
      'session.start',
      'session.message',
      'session.backlog',
      'build.start',
      'deploy.start',
      'session.end',
    ]);

    const endEvent = events[events.length - 1];
    expect(endEvent.event).toBe('session.end');
    if (endEvent.event === 'session.end') {
      expect(endEvent.data.messageCount).toBe(1);
      expect(endEvent.data.backlogCount).toBe(2);
      expect(endEvent.data.buildCount).toBe(1);
      expect(endEvent.data.deployCount).toBe(1);
    }

    const bundleJson = await store.getState().exportBundle();
    expect(bundleJson).not.toBeNull();
    const bundle = JSON.parse(bundleJson ?? '{}') as TelemetryExportBundle;
    expect(bundle.sessionId).toBe('session-1');
    expect(bundle.eventCount).toBe(events.length);
    expect(bundle.events.length).toBe(events.length);
  });

  it('records LLM gateway telemetry events', async () => {
    const store = createTelemetryStore();
    await store.getState().startSession({
      sessionId: 'session-2',
      path: 'scratch',
      startedAt: 1000,
    });

    const telemetry = store.getState().createGatewayTelemetry();
    const request = buildRequest();
    const selection = buildSelection();
    const response = buildResponse();

    await telemetry.onRequest?.(request, selection);
    await telemetry.onResponse?.(request, response);
    await telemetry.onError?.(request, {
      category: 'retryable',
      code: 'rate_limit',
      message: 'Rate limit',
      provider: 'openai',
      status: 429,
    });

    const llmEvents = store
      .getState()
      .events.filter((event) => event.event.startsWith('llm.'));
    expect(llmEvents.map((event) => event.event)).toEqual([
      'llm.request',
      'llm.response',
      'llm.error',
    ]);
    expect(JSON.stringify(llmEvents)).not.toContain(selection.provider.apiKey);

    const requestEvent = llmEvents[0];
    expect(requestEvent?.event).toBe('llm.request');
    if (requestEvent?.event === 'llm.request') {
      expect(JSON.stringify(requestEvent.data)).not.toContain(selection.provider.apiKey);
    }

    const responseEvent = llmEvents[1];
    expect(responseEvent?.event).toBe('llm.response');
    if (responseEvent?.event === 'llm.response') {
      expect(responseEvent.data.promptTokens).toBe(10);
      expect(responseEvent.data.completionTokens).toBe(5);
      expect(responseEvent.data.cost).toBe(0.01);
    }
  });

  it('rotates sessions and restores per-session llm cost totals without bleed', async () => {
    const store = createTelemetryStore();

    await store.getState().startSession({
      sessionId: 'session-a',
      path: 'scratch',
      startedAt: 1000,
    });
    await store
      .getState()
      .appendEvent(
        buildLlmResponseEvent({
          sessionId: 'session-a',
          role: 'chat',
          model: 'gpt-4o-mini',
          cost: 0.12,
          timestamp: 1100,
        }),
      );
    await store.getState().endSession({ endedAt: 1200 });

    await store.getState().startSession({
      sessionId: 'session-b',
      path: 'scratch',
      startedAt: 2000,
    });
    await store
      .getState()
      .appendEvent(
        buildLlmResponseEvent({
          sessionId: 'session-b',
          role: 'builder',
          model: 'claude-sonnet-4-20250514',
          cost: 0.34,
          unknownModel: true,
          timestamp: 2100,
        }),
      );

    const activeSessionSummary = buildSessionCostSummary(store.getState().events, 'session-b');
    expect(activeSessionSummary.totalCost).toBeCloseTo(0.34, 6);
    expect(activeSessionSummary.roles).toHaveLength(1);
    expect(activeSessionSummary.roles[0]?.role).toBe('builder');
    expect(activeSessionSummary.hasUnknownModel).toBe(true);
    expect(store.getState().events.every((event) => event.sessionId === 'session-b')).toBe(true);

    const loadedA = await store.getState().loadEvents('session-a');
    expect(loadedA).toBe(true);
    const sessionASummary = buildSessionCostSummary(store.getState().events, 'session-a');
    expect(sessionASummary.totalCost).toBeCloseTo(0.12, 6);
    expect(sessionASummary.roles).toHaveLength(1);
    expect(sessionASummary.roles[0]?.role).toBe('chat');
    expect(sessionASummary.hasUnknownModel).toBe(false);

    const loadedB = await store.getState().loadEvents('session-b');
    expect(loadedB).toBe(true);
    const sessionBSummary = buildSessionCostSummary(store.getState().events, 'session-b');
    expect(sessionBSummary.totalCost).toBeCloseTo(0.34, 6);
    expect(sessionBSummary.roles).toHaveLength(1);
    expect(sessionBSummary.roles[0]?.role).toBe('builder');
    expect(sessionBSummary.hasUnknownModel).toBe(true);

    const sessionAExport = await store.getState().exportEvents('session-a');
    expect(sessionAExport).not.toBeNull();
    const parsedA = JSON.parse(sessionAExport ?? '[]') as Array<{ event: string }>;
    expect(parsedA.some((event) => event.event === 'session.end')).toBe(true);
  });
});
