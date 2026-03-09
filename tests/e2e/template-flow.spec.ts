import { expect, test } from '@playwright/test';
import { gotoApp } from './utils/navigation';

test('template flow swaps and deploys a preview', async ({ page }) => {
  await gotoApp(page);

  const closeSettings = page.getByRole('button', { name: 'Close' }).first();
  if (await closeSettings.isVisible()) {
    await closeSettings.click();
    await expect(closeSettings).toBeHidden();
  }

  await page.getByRole('button', { name: 'New Conversation' }).click();
  const resetDialog = page.getByRole('dialog', { name: 'Start a new conversation?' });
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole('button', { name: 'Start fresh' }).click();
  await expect(resetDialog).toBeHidden();

  const chatPanel = page.getByLabel('Chat panel');
  await expect(chatPanel.getByText('New session')).toBeVisible();
  const composer = chatPanel.getByLabel('Chat composer');
  await composer.fill('We need a launch page for a ceramics studio in Portland.');
  await composer.press('Enter');
  await expect(chatPanel.getByText("Here's your first preview!")).toBeVisible({
    timeout: 45_000,
  });

  const validateButton = page.getByRole('button', { name: /Validate/i });
  const swapButton = page.getByRole('button', { name: 'Swap' });
  await expect(validateButton).toBeEnabled({ timeout: 45_000 });

  let expectedLiveLabel = 'Green Live';
  for (let i = 0; i < 3; i += 1) {
    await validateButton.click();
    await expect(swapButton).toBeEnabled();
    await swapButton.click();
    await expect(page.getByText(expectedLiveLabel, { exact: true })).toBeVisible();
    expectedLiveLabel = expectedLiveLabel === 'Green Live' ? 'Blue Live' : 'Green Live';
  }

  const deployButton = page.getByRole('button', { name: /Deploy/i });
  await expect(deployButton).toBeDisabled();

  await page.waitForFunction(
    () => typeof window !== 'undefined' && Boolean(window.__protoStudioTest),
  );
  await page.evaluate(() => {
    const testApi = (
      window as typeof window & {
        __protoStudioTest?: {
          setDeployTokens: (tokens: {
            github?: string;
            cloudflare?: string;
            netlify?: string;
            vercel?: string;
          }) => void;
        };
      }
    ).__protoStudioTest;
    testApi?.setDeployTokens({
      github: 'ghp_123456789012345678901234567890123456',
    });
  });

  await expect(deployButton).toBeEnabled();
  await deployButton.click();

  await expect(page.getByText('Live URL')).toBeVisible();
  await expect(page.getByRole('link', { name: /https:\/\// })).toBeVisible();
});
