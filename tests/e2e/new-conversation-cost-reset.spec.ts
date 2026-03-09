import { expect, test } from '@playwright/test';
import { gotoApp } from './utils/navigation';

type TestTelemetryEvent = {
  timestamp: number;
  sessionId: string;
  event: string;
};

test('new conversation rotates telemetry session and resets active cost ticker', async ({
  page,
}) => {
  await gotoApp(page);

  await page.waitForFunction(
    () => {
      const testApi = window.__protoStudioTest;
      return typeof window !== 'undefined' && Boolean(testApi?.getActiveTelemetrySessionId?.());
    },
  );

  const initialSessionId = await page.evaluate(
    () => window.__protoStudioTest?.getActiveTelemetrySessionId() ?? null,
  );
  expect(initialSessionId).not.toBeNull();

  const costButton = page.getByRole('button', { name: /\$0\.00/ }).first();
  await expect(costButton).toBeVisible();

  await page.evaluate(
    async ({ sessionId, timestamp }) => {
      if (!sessionId || !window.__protoStudioTest) {
        throw new Error('Missing test hook or active session id.');
      }
      await window.__protoStudioTest.appendTelemetryEvent({
        sessionId,
        timestamp,
        event: 'llm.response',
        data: {
          role: 'chat',
          provider: 'openai',
          model: 'gpt-4o-mini',
          promptTokens: 600,
          completionTokens: 240,
          cost: 0.3,
          latencyMs: 120,
          unknownModel: false,
        },
      });
      await window.__protoStudioTest.appendTelemetryEvent({
        sessionId,
        timestamp: timestamp + 1,
        event: 'llm.response',
        data: {
          role: 'builder',
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          promptTokens: 420,
          completionTokens: 180,
          cost: 0.2,
          latencyMs: 180,
          unknownModel: false,
        },
      });
    },
    {
      sessionId: initialSessionId,
      timestamp: Date.now(),
    },
  );

  await expect(page.getByRole('button', { name: /\$0\.50/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'New Conversation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a new conversation?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Start fresh' }).click();

  await expect(page.getByRole('button', { name: /\$0\.00/ }).first()).toBeVisible();

  const afterReset = await page.evaluate(async (oldSessionId) => {
    const testApi = window.__protoStudioTest;
    const activeSessionId = testApi?.getActiveTelemetrySessionId() ?? null;
    const activeEvents = (testApi?.getTelemetryEvents() ?? []) as TestTelemetryEvent[];
    const oldSessionEvents = oldSessionId
      ? (((await testApi?.exportTelemetryEvents(oldSessionId)) ?? []) as TestTelemetryEvent[])
      : [];

    return {
      activeSessionId,
      activeEvents,
      oldSessionEvents,
    };
  }, initialSessionId);

  expect(afterReset.activeSessionId).not.toBeNull();
  expect(afterReset.activeEvents.some((event) => event.event === 'llm.response')).toBe(false);
  expect(
    afterReset.activeEvents.every((event) => event.sessionId === afterReset.activeSessionId),
  ).toBe(true);
  expect(afterReset.oldSessionEvents.some((event) => event.event === 'session.end')).toBe(true);
});
