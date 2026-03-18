import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoApp } from './utils/navigation';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

async function openSettings(page: Page): Promise<Locator> {
  await gotoApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function getOpenAIPingButton(dialog: Locator): Promise<Locator> {
  const proxyButton = dialog.getByRole('button', { name: 'Ping proxy' });
  if ((await proxyButton.count()) > 0) {
    return proxyButton.first();
  }
  return dialog.getByRole('button', { name: 'Ping' }).first();
}

test('openai proxy ping maps auth, rate-limit, and service outcomes from API responses', async ({
  page,
}) => {
  let callCount = 0;
  const routeHandler = async (route: { request: () => { method: () => string }; fulfill: (value: { status: number; headers: Record<string, string>; body?: string }) => Promise<void> }) => {
    callCount += 1;
    const method = route.request().method();
    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: CORS_HEADERS,
      });
      return;
    }

    if (callCount === 1) {
      await route.fulfill({
        status: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ object: 'list', data: [{ id: 'gpt-4o-mini' }] }),
      });
      return;
    }

    if (callCount === 2) {
      await route.fulfill({
        status: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: { code: 'invalid_api_key', message: 'Unauthorized' } }),
      });
      return;
    }

    if (callCount === 3) {
      await route.fulfill({
        status: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: { message: 'Rate limited' } }),
      });
      return;
    }

    await route.fulfill({
      status: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: { message: 'Service unavailable' } }),
    });
  };
  await page.route('**/api/openai/v1/models', routeHandler);
  await page.route('https://api.openai.com/v1/models', routeHandler);

  const dialog = await openSettings(page);
  const pingButton = await getOpenAIPingButton(dialog);
  const openaiField = pingButton.locator('xpath=ancestor::div[2]');

  await pingButton.click();
  await expect(openaiField).toContainText('OpenAI proxy is healthy.');
  await expect(openaiField.getByText('Valid', { exact: true })).toBeVisible();

  await pingButton.click();
  await expect(openaiField).toContainText('OpenAI rejected the server-managed key.');
  await expect(openaiField.getByText('Invalid', { exact: true })).toBeVisible();

  await pingButton.click();
  await expect(openaiField).toContainText('OpenAI rate-limited validation.');
  await expect(openaiField.getByText('Error', { exact: true })).toBeVisible();

  await pingButton.click();
  await expect(openaiField).toContainText('OpenAI proxy validation failed with status 503.');
  await expect(openaiField.getByText('Error', { exact: true })).toBeVisible();
});

test('openai proxy ping suppresses stale responses when a newer ping starts', async ({ page }) => {
  let callCount = 0;
  const routeHandler = async (route: { fulfill: (value: { status: number; headers: Record<string, string>; body?: string }) => Promise<void> }) => {
    callCount += 1;
    if (callCount === 1) {
      await page.waitForTimeout(700);
      await route.fulfill({
        status: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: { code: 'invalid_api_key', message: 'Unauthorized' } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ object: 'list', data: [{ id: 'gpt-4o-mini' }] }),
    });
  };
  await page.route('**/api/openai/v1/models', routeHandler);
  await page.route('https://api.openai.com/v1/models', routeHandler);

  const dialog = await openSettings(page);
  const pingButton = await getOpenAIPingButton(dialog);
  const openaiField = pingButton.locator('xpath=ancestor::div[2]');

  await pingButton.click();
  await pingButton.click();

  await page.waitForTimeout(900);
  await expect(openaiField).toContainText('OpenAI proxy is healthy.');
  await expect(openaiField).not.toContainText('rejected the server-managed key');
});
