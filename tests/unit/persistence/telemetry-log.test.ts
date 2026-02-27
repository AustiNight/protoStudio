import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';

import { resetStudioDbForTests, STUDIO_DB_NAME } from '../../../src/persistence/db';
import { TelemetryLog } from '../../../src/persistence/telemetry-log';
import type { TelemetryEvent } from '../../../src/types/telemetry';

function buildBuildStart(
  sessionId: string,
  timestamp: number,
  workItemId: string,
): TelemetryEvent {
  return {
    sessionId,
    timestamp,
    event: 'build.start',
    data: { workItemId, attempt: 1 },
  };
}

function buildBuildComplete(sessionId: string, timestamp: number): TelemetryEvent {
  return {
    sessionId,
    timestamp,
    event: 'build.complete',
    data: { durationMs: 1200, status: 'success' },
  };
}

function buildLlmResponse(sessionId: string, timestamp: number): TelemetryEvent {
  return {
    sessionId,
    timestamp,
    event: 'llm.response',
    data: {
      role: 'chat',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      promptTokens: 120,
      completionTokens: 45,
      cost: 0.02,
      latencyMs: 850,
      unknownModel: false,
    },
  };
}

function buildPreview(sessionId: string, timestamp: number): TelemetryEvent {
  return {
    sessionId,
    timestamp,
    event: 'build.preview',
    data: { durationMs: 450 },
  };
}

describe('TelemetryLog', () => {
  beforeEach(async () => {
    resetStudioDbForTests();
    await deleteDB(STUDIO_DB_NAME);
  });

  it('should append telemetry events in order and keep the log append-only', async () => {
    const log = new TelemetryLog();
    const eventA1 = buildBuildStart('session-a', 1, 'work-a');
    const eventB1 = buildBuildStart('session-b', 2, 'work-b');
    const eventA2 = buildBuildComplete('session-a', 3);

    await log.append(eventA1);
    await log.append(eventB1);
    await log.append(eventA2);

    const eventsResult = await log.getEvents('session-a');
    expect(eventsResult.ok).toBe(true);
    if (!eventsResult.ok) {
      return;
    }

    expect(eventsResult.value.map((event) => event.event)).toEqual([
      'build.start',
      'build.complete',
    ]);
  });

  it('should export telemetry as JSON string', async () => {
    const log = new TelemetryLog();
    const event = buildLlmResponse('session-a', 4);

    await log.append(event);
    const exportResult = await log.exportAsJSON('session-a');

    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) {
      return;
    }

    const parsed = JSON.parse(exportResult.value) as TelemetryEvent[];
    expect(parsed.length).toBe(1);
    expect(parsed[0].event).toBe('llm.response');
  });

  it('should clear telemetry events for a session', async () => {
    const log = new TelemetryLog();
    const event = buildPreview('session-a', 5);

    await log.append(event);
    const clearResult = await log.clear('session-a');
    expect(clearResult.ok).toBe(true);

    const eventsResult = await log.getEvents('session-a');
    expect(eventsResult.ok).toBe(true);
    if (!eventsResult.ok) {
      return;
    }

    expect(eventsResult.value.length).toBe(0);
  });

  it('should reject telemetry events that fail schema validation', async () => {
    const log = new TelemetryLog();
    const invalidEvent = {
      sessionId: 'session-a',
      timestamp: 6,
      event: 'llm.response',
      data: {
        role: 'chat',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        promptTokens: 10,
        completionTokens: 5,
        cost: 0.01,
        latencyMs: 100,
        unknownModel: false,
        prompt: 'do not store this',
      },
    } as unknown as TelemetryEvent;

    const result = await log.append(invalidEvent);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('telemetry_validation_failed');
    }

    const eventsResult = await log.getEvents('session-a');
    expect(eventsResult.ok).toBe(true);
    if (!eventsResult.ok) {
      return;
    }

    expect(eventsResult.value.length).toBe(0);
  });
});
