import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoApp } from './utils/navigation';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

const OPENAI_VALID_KEY = 'sk-valid-openai-key-0123456789';
const OPENAI_INVALID_KEY = 'sk-invalid-auth-key-0123456789';
const OPENAI_RATE_LIMIT_KEY = 'sk-rate-limit-key-0123456789';
const OPENAI_SERVICE_KEY = 'sk-service-key-0123456789';
const OPENAI_STALE_FIRST_KEY = 'sk-stale-first-key-0123456789';
const OPENAI_STALE_SECOND_KEY = 'sk-stale-second-key-0123456789';

async function openSettings(page: Page): Promise<Locator> {
  await gotoApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.route('https://api.openai.com/v1/models', async (route) => {
    const method = route.request().method();
    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: CORS_HEADERS,
      });
      return;
    }

    const authorizationHeader = route.request().headers().authorization ?? '';
    const key = authorizationHeader.replace(/^Bearer\s+/i, '');

    if (key === OPENAI_VALID_KEY || key === OPENAI_STALE_SECOND_KEY) {
      await route.fulfill({
        status: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ object: 'list', data: [{ id: 'gpt-4o-mini' }] }),
      });
      return;
    }

    if (key === OPENAI_INVALID_KEY) {
      await route.fulfill({
        status: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: { message: 'Unauthorized' } }),
      });
      return;
    }

    if (key === OPENAI_RATE_LIMIT_KEY) {
      await route.fulfill({
        status: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: { message: 'Rate limited' } }),
      });
      return;
    }

    if (key === OPENAI_SERVICE_KEY) {
      await route.fulfill({
        status: 503,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: { message: 'Service unavailable' } }),
      });
      return;
    }

    if (key === OPENAI_STALE_FIRST_KEY) {
      await page.waitForTimeout(700);
      await route.fulfill({
        status: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: { message: 'Unauthorized' } }),
      });
      return;
    }

    await route.fulfill({
      status: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: { message: 'Unexpected test key' } }),
    });
  });
});

test('openai key ping maps auth, rate-limit, and service outcomes from API responses', async ({
  page,
}) => {
  const dialog = await openSettings(page);
  const openaiInput = dialog.getByPlaceholder('sk-...');
  const openaiField = openaiInput.locator('..').locator('..');
  const pingButton = openaiField.getByRole('button', { name: 'Ping' });

  await openaiInput.fill(OPENAI_VALID_KEY);
  await pingButton.click();
  await expect(openaiField).toContainText('OpenAI key is valid.');
  await expect(openaiField.getByText('Valid', { exact: true })).toBeVisible();

  await openaiInput.fill(OPENAI_INVALID_KEY);
  await pingButton.click();
  await expect(openaiField).toContainText('OpenAI rejected this key (401).');
  await expect(openaiField.getByText('Invalid', { exact: true })).toBeVisible();

  await openaiInput.fill(OPENAI_RATE_LIMIT_KEY);
  await pingButton.click();
  await expect(openaiField).toContainText('OpenAI rate-limited validation.');
  await expect(openaiField.getByText('Error', { exact: true })).toBeVisible();

  await openaiInput.fill(OPENAI_SERVICE_KEY);
  await pingButton.click();
  await expect(openaiField).toContainText('service/connectivity issue');
  await expect(openaiField.getByText('Error', { exact: true })).toBeVisible();
});

test('openai key ping suppresses stale responses when a newer ping starts', async ({ page }) => {
  const dialog = await openSettings(page);
  const openaiInput = dialog.getByPlaceholder('sk-...');
  const openaiField = openaiInput.locator('..').locator('..');
  const pingButton = openaiField.getByRole('button', { name: 'Ping' });

  await openaiInput.fill(OPENAI_STALE_FIRST_KEY);
  await pingButton.click();

  await openaiInput.fill(OPENAI_STALE_SECOND_KEY);
  await pingButton.click();

  await page.waitForTimeout(900);
  await expect(openaiField).toContainText('OpenAI key is valid.');
  await expect(openaiField).not.toContainText('OpenAI rejected this key');
});
