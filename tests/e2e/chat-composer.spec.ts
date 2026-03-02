import { expect, test, type Page } from '@playwright/test';

type SeedWorkItem = {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  effort: 'S' | 'M' | 'L';
  status: 'backlog';
  order: number;
  dependencies: string[];
  rationale: string;
  createdAt: number;
  atomType: 'structure' | 'content' | 'style' | 'behavior' | 'integration';
  filesTouch: string[];
  estimatedLines: number;
  visibleChange: string;
};

type TestChatMessage = {
  id: string;
  sessionId: string;
  sender: 'user' | 'chat_ai' | 'system';
  content: string;
  metadata?: {
    backlogItemId?: string;
  };
};

const SESSION_ID = 'session-demo';

function buildItem(id: string, title: string): SeedWorkItem {
  return {
    id,
    sessionId: SESSION_ID,
    title,
    description: 'Focused edit context',
    effort: 'M',
    status: 'backlog',
    order: 1,
    dependencies: [],
    rationale: 'E2E composer coverage',
    createdAt: Date.now(),
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 40,
    visibleChange: 'Visible focused change',
  };
}

async function readChatMessages(page: Page): Promise<TestChatMessage[]> {
  return page.evaluate(() => {
    const testApi = (
      window as typeof window & {
        __protoStudioTest?: {
          getChatMessages: () => TestChatMessage[];
        };
      }
    ).__protoStudioTest;
    return testApi?.getChatMessages() ?? [];
  });
}

test('chat composer accepts typing, send controls, and keyboard behavior', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(
    () => typeof window !== 'undefined' && Boolean(window.__protoStudioTest?.getChatMessages),
  );

  const chatPanel = page.getByLabel('Chat panel');
  const composer = chatPanel.getByLabel('Chat composer');
  const sendButton = chatPanel.getByRole('button', { name: 'Send' });

  await expect(composer).toBeVisible();
  await expect(composer).toHaveAttribute('placeholder', 'Type your next instruction...');
  await expect(sendButton).toBeDisabled();

  const messagesBefore = await readChatMessages(page);

  await composer.fill('    ');
  await expect(sendButton).toBeDisabled();
  await composer.press('Enter');

  const messagesAfterBlankEnter = await readChatMessages(page);
  expect(messagesAfterBlankEnter).toHaveLength(messagesBefore.length);

  await composer.fill('Add testimonials under the hero section.');
  await expect(sendButton).toBeEnabled();
  await composer.press('Enter');

  await expect(
    chatPanel.getByText('Add testimonials under the hero section.', { exact: true }),
  ).toBeVisible();
  await expect(composer).toHaveValue('');
  await expect(sendButton).toBeDisabled();

  const messagesAfterFirstSend = await readChatMessages(page);
  expect(messagesAfterFirstSend).toHaveLength(messagesBefore.length + 1);
  const firstSent = messagesAfterFirstSend[messagesAfterFirstSend.length - 1];
  expect(firstSent?.sender).toBe('user');
  expect(firstSent?.content).toBe('Add testimonials under the hero section.');
  const initialLastMessage = messagesBefore[messagesBefore.length - 1];
  expect(firstSent?.sessionId).toBe(initialLastMessage?.sessionId);

  const focusedItemId = 'atom-focused-hero-polish';
  await page.waitForFunction(
    () => typeof window !== 'undefined' && Boolean(window.__protoStudioTest?.seedBacklog),
  );
  await page.evaluate(
    ({ item, focusId }) => {
      window.__protoStudioTest?.seedBacklog([item], {
        onDeckId: focusId,
        focusedItemId: focusId,
      });
    },
    {
      item: buildItem(focusedItemId, 'Hero polish'),
      focusId: focusedItemId,
    },
  );

  await expect(composer).toHaveAttribute('placeholder', 'Ask about Hero polish...');

  await composer.fill('Line one');
  await composer.press('Shift+Enter');
  await composer.type('Line two');
  await sendButton.click();

  await expect(chatPanel.getByText(/Line one\s*Line two/)).toBeVisible();

  const messagesAfterShiftSend = await readChatMessages(page);
  expect(messagesAfterShiftSend).toHaveLength(messagesBefore.length + 2);
  const secondSent = messagesAfterShiftSend[messagesAfterShiftSend.length - 1];
  expect(secondSent?.sender).toBe('user');
  expect(secondSent?.content).toBe('Line one\nLine two');
  expect(secondSent?.metadata?.backlogItemId).toBe(focusedItemId);
});
