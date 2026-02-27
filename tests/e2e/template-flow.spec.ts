import { expect, test } from '@playwright/test';

test('template flow swaps and deploys a preview', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByText('We need a launch page for a ceramics studio in Portland.'),
  ).toBeVisible();

  const blueFrame = page.frameLocator('iframe[title="Preview slot blue"]');
  await expect(blueFrame.getByText('JUNIPER')).toBeVisible();

  const validateButton = page.getByRole('button', { name: /Validate/i });
  const swapButton = page.getByRole('button', { name: 'Swap' });

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
