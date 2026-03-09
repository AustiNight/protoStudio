import { expect, test } from '@playwright/test';
import { gotoApp } from './utils/navigation';

test('deploy token validation gates hosts', async ({ page }) => {
  await gotoApp(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('tab', { name: 'Deploy Tokens' }).click();

  const githubInput = dialog.getByPlaceholder('ghp_... or github_pat_...');
  const githubField = githubInput.locator('..').locator('..');

  await expect(dialog.getByText('Locked: test the token to unlock.').first()).toBeVisible();

  await githubInput.fill('invalid_token');
  await githubField.getByRole('button', { name: 'Test token' }).click();

  await expect(githubField).toContainText('GitHub token format looks off.');
  await expect(dialog.getByText('Locked: token failed validation.').first()).toBeVisible();

  await githubInput.fill('github_pat_0123456789abcdef0123');
  await githubField.getByRole('button', { name: 'Test token' }).click();

  await expect(githubField).toContainText('GitHub token looks valid.');
  await expect(dialog.getByText('Unlocked', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText('Ready to deploy.').first()).toBeVisible();
});
