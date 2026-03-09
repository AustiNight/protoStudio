import type { Page } from '@playwright/test';

const E2E_ENTRY_PATH = process.env.E2E_ENTRY_PATH?.trim();

export async function gotoApp(page: Page): Promise<void> {
  await page.goto(E2E_ENTRY_PATH && E2E_ENTRY_PATH.length > 0 ? E2E_ENTRY_PATH : '/');
}
