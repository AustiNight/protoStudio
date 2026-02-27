import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';

import { resetStudioDbForTests, STUDIO_DB_NAME } from '../../../src/persistence/db';
import { createTelemetryStore } from '../../../src/store/telemetry-store';
import type { LLMModelSelection, LLMRequest, LLMResponse } from '../../../src/types/llm';
import type { TelemetryExportBundle } from '../../../src/types/telemetry';

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
      apiKey: 'sk-test',
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

    const responseEvent = llmEvents[1];
    expect(responseEvent?.event).toBe('llm.response');
    if (responseEvent?.event === 'llm.response') {
      expect(responseEvent.data.promptTokens).toBe(10);
      expect(responseEvent.data.completionTokens).toBe(5);
      expect(responseEvent.data.cost).toBe(0.01);
    }
  });
});
