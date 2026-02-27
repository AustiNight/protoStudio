import { expect, test } from '@playwright/test';

test('deploy token validation gates hosts', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('tab', { name: 'Deploy Tokens' }).click();

  const githubInput = dialog.getByPlaceholder('ghp_... or github_pat_...');
  const githubField = githubInput.locator('..').locator('..');
  const githubHostCard = dialog.locator('div.rounded-2xl', {
    has: dialog.getByRole('heading', { name: 'GitHub Pages' }),
  });

  await expect(
    githubHostCard.getByText('Locked: test the token to unlock.'),
  ).toBeVisible();

  await githubInput.fill('invalid_token');
  await githubField.getByRole('button', { name: 'Test token' }).click();

  await expect(githubField).toContainText('GitHub token format looks off.');
  await expect(
    githubHostCard.getByText('Locked: token failed validation.'),
  ).toBeVisible();

  await githubInput.fill('github_pat_0123456789abcdef0123');
  await githubField.getByRole('button', { name: 'Test token' }).click();

  await expect(githubField).toContainText('GitHub token looks valid.');
  await expect(githubHostCard.getByText('Unlocked', { exact: true })).toBeVisible();
  await expect(githubHostCard).toContainText('Ready to deploy.');
});
