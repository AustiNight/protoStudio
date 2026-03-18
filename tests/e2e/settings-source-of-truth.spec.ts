import { expect, test, type Page } from '@playwright/test';
import { gotoApp } from './utils/navigation';

type TestSettingsSnapshot = {
  llmKeys: Record<'openai' | 'anthropic' | 'google', string>;
  llmModels: {
    chat: { provider: 'openai' | 'anthropic' | 'google'; model: string };
    builder: { provider: 'openai' | 'anthropic' | 'google'; model: string };
  };
  deployTokens: Record<'github' | 'cloudflare' | 'netlify' | 'vercel', string>;
};

async function readSettingsSnapshot(page: Page) {
  return page.evaluate(() => {
    const testApi = (
      window as Window & {
        __protoStudioTest?: { getSettingsSnapshot?: () => TestSettingsSnapshot };
      }
    ).__protoStudioTest;
    return testApi?.getSettingsSnapshot() ?? null;
  });
}

test('settings updates flow through store-backed runtime consumers without refresh', async ({
  page,
}) => {
  await gotoApp(page);
  await page.waitForFunction(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.__protoStudioTest?.getSettingsSnapshot),
  );

  const deployButton = page.getByRole('button', { name: 'Deploy', exact: true });
  await expect(deployButton).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('tab', { name: 'Models' }).click();
  const modelPanel = dialog.locator('section[role="tabpanel"]:not([hidden])');
  const chatModelCard = modelPanel.getByRole('heading', { name: 'Chat model' }).locator('..');
  const chatProviderSelect = chatModelCard.locator('select').first();
  const chatModelSelect = chatModelCard.locator('select').nth(1);
  await chatProviderSelect.selectOption('anthropic');
  const selectedChatModel = await chatModelSelect.inputValue();

  await dialog.getByRole('tab', { name: 'Deploy Tokens' }).click();
  await dialog
    .getByPlaceholder('ghp_... or github_pat_...')
    .fill('github_pat_runtime01234567890123');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  await expect(deployButton).toBeEnabled();

  const snapshot = await readSettingsSnapshot(page);
  expect(snapshot).not.toBeNull();
  expect(snapshot?.llmKeys.openai).toBe('');
  expect(snapshot?.llmModels.chat.provider).toBe('anthropic');
  expect(snapshot?.llmModels.chat.model).toBe(selectedChatModel);
  expect(snapshot?.deployTokens.github).toBe('github_pat_runtime01234567890123');
});
