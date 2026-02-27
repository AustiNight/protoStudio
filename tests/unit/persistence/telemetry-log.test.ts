import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';

import { resetStudioDbForTests, STUDIO_DB_NAME } from '../../../src/persistence/db';
import { TelemetryLog } from '../../../src/persistence/telemetry-log';
import type { TelemetryEvent } from '../../../src/types/telemetry';

function buildEvent(sessionId: string, event: string, timestamp: number): TelemetryEvent {
  return {
    sessionId,
    event,
    timestamp,
    data: { source: 'test' },
  };
}

describe('TelemetryLog', () => {
  beforeEach(async () => {
    resetStudioDbForTests();
    await deleteDB(STUDIO_DB_NAME);
  });

  it('should append telemetry events and retrieve by session in order', async () => {
    const log = new TelemetryLog();
    const eventA1 = buildEvent('session-a', 'build.start', 1);
    const eventB1 = buildEvent('session-b', 'build.start', 2);
    const eventA2 = buildEvent('session-a', 'build.done', 3);

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
      'build.done',
    ]);
  });

  it('should export telemetry as JSON string', async () => {
    const log = new TelemetryLog();
    const event = buildEvent('session-a', 'llm.request', 4);

    await log.append(event);
    const exportResult = await log.exportAsJSON('session-a');

    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) {
      return;
    }

    const parsed = JSON.parse(exportResult.value) as TelemetryEvent[];
    expect(parsed.length).toBe(1);
    expect(parsed[0].event).toBe('llm.request');
  });

  it('should clear telemetry events for a session', async () => {
    const log = new TelemetryLog();
    const event = buildEvent('session-a', 'guardrail.pass', 5);

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
});
