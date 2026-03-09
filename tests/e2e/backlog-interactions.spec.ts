import { expect, test } from '@playwright/test';
import { gotoApp } from './utils/navigation';

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

const SESSION_ID = 'session-demo';

function buildItem(partial: Partial<SeedWorkItem> & Pick<SeedWorkItem, 'id' | 'title'>): SeedWorkItem {
  return {
    id: partial.id,
    sessionId: SESSION_ID,
    title: partial.title,
    description: partial.description ?? 'Update the experience.',
    effort: partial.effort ?? 'M',
    status: 'backlog',
    order: partial.order ?? 1,
    dependencies: partial.dependencies ?? [],
    rationale: partial.rationale ?? 'E2E backlog coverage.',
    createdAt: partial.createdAt ?? Date.now(),
    atomType: partial.atomType ?? 'content',
    filesTouch: partial.filesTouch ?? ['index.html'],
    estimatedLines: partial.estimatedLines ?? 42,
    visibleChange: partial.visibleChange ?? 'Visible change updated.',
  };
}

test('backlog interactions handle focus, pause, and reorder decisions', async ({ page }) => {
  await gotoApp(page);

  await page.waitForFunction(
    () => typeof window !== 'undefined' && Boolean(window.__protoStudioTest?.seedBacklog),
  );

  const now = Date.now();
  const paletteId = 'atom-2-color-palette';

  const items: SeedWorkItem[] = [
    buildItem({
      id: 'atom-1-hero-layout',
      title: 'Hero layout',
      atomType: 'structure',
      order: 1,
      createdAt: now - 4000,
      estimatedLines: 84,
      visibleChange: 'New hero section layout.',
    }),
    buildItem({
      id: paletteId,
      title: 'Color palette refresh',
      atomType: 'style',
      order: 2,
      createdAt: now - 3000,
      estimatedLines: 36,
      visibleChange: 'Updated palette tokens.',
    }),
    buildItem({
      id: 'atom-3-class-schedule',
      title: 'Class schedule block',
      atomType: 'content',
      order: 3,
      dependencies: [paletteId],
      createdAt: now - 2000,
      estimatedLines: 28,
      visibleChange: 'Schedule block now visible.',
    }),
    buildItem({
      id: 'atom-4-instructor-bios',
      title: 'Instructor bios',
      atomType: 'content',
      order: 4,
      createdAt: now - 1000,
      estimatedLines: 24,
      visibleChange: 'Instructor bios added.',
    }),
  ];

  await page.evaluate((seedItems) => {
    window.__protoStudioTest?.seedBacklog(seedItems);
  }, items);

  const backlogPanel = page.getByLabel('Backlog panel');
  const chatPanel = page.getByLabel('Chat panel');

  await expect(backlogPanel.getByText('Hero layout')).toBeVisible();
  await expect(backlogPanel.getByText('Backlog Queue')).toBeVisible();

  const focusCard = backlogPanel
    .getByRole('listitem')
    .filter({ hasText: 'Instructor bios' });
  await focusCard.click();
  await expect(chatPanel.getByText('Instructor bios', { exact: true })).toBeVisible();
  await expect(chatPanel.getByText('Click focused card again to clear.')).toBeVisible();

  await focusCard.click();
  await expect(chatPanel.getByText('General', { exact: true })).toBeVisible();
  await expect(chatPanel.getByText('Click a backlog card to focus.')).toBeVisible();

  const pauseButton = backlogPanel.getByRole('button', { name: 'Pause' });
  await pauseButton.click();
  await expect(backlogPanel.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(backlogPanel.getByRole('listitem').first()).toContainText('Paused');

  const resumeButton = backlogPanel.getByRole('button', { name: 'Resume' });
  await resumeButton.click();
  await expect(backlogPanel.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(backlogPanel.getByRole('listitem').first()).toContainText('Drag ready');

  const paletteCard = backlogPanel
    .getByRole('listitem')
    .filter({ hasText: 'Color palette refresh' });
  const biosCard = backlogPanel
    .getByRole('listitem')
    .filter({ hasText: 'Instructor bios' });

  await biosCard.dragTo(paletteCard);
  await expect(chatPanel.getByText(/Reorder approved/)).toBeVisible();
  await expect(backlogPanel.getByRole('listitem').first()).toContainText('Instructor bios');

  const scheduleCard = backlogPanel
    .getByRole('listitem')
    .filter({ hasText: 'Class schedule block' });
  await scheduleCard.dragTo(paletteCard);
  await expect(chatPanel.getByText(/Reorder denied/)).toBeVisible();
  await expect(backlogPanel.getByRole('listitem').first()).toContainText('Instructor bios');
});
