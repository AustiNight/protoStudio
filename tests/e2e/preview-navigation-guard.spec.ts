import { expect, test } from '@playwright/test';

test('preview iframe blocks internal navigation and stays on srcdoc', async ({ page }) => {
  await page.goto('/');

  const previewHtml = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="UTF-8" /><title>Guarded Preview</title></head>',
    '<body>',
    '<h1 id="title">Guarded Preview</h1>',
    '<a id="escape" href="/scratch">Open app route</a>',
    '</body>',
    '</html>',
  ].join('');

  await page.evaluate((html) => {
    window.dispatchEvent(
      new CustomEvent('preview:swap', {
        detail: { html },
      }),
    );
  }, previewHtml);

  await page.waitForFunction(() => {
    const blue = document.querySelector('iframe[title="Preview slot blue"]');
    const green = document.querySelector('iframe[title="Preview slot green"]');
    const isVisible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      return element.offsetParent !== null;
    };
    return isVisible(blue) || isVisible(green);
  });

  const liveSlot = await page.evaluate(() => {
    const blue = document.querySelector('iframe[title="Preview slot blue"]');
    const isVisible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      return element.offsetParent !== null;
    };
    if (isVisible(blue)) {
      return 'blue';
    }
    return 'green';
  });

  const liveFrame = page.locator(`iframe[title="Preview slot ${liveSlot}"]`);
  await expect(liveFrame).toBeVisible();

  const frame = liveFrame.contentFrame();
  if (!frame) {
    throw new Error('Preview frame not available');
  }

  await expect(frame.locator('#title')).toHaveText('Guarded Preview');
  await frame.locator('#escape').click();
  await expect(frame.locator('#title')).toHaveText('Guarded Preview');

  const href = await liveFrame.evaluate((element) => {
    if (!(element instanceof HTMLIFrameElement)) {
      return '';
    }
    return element.contentWindow?.location.href ?? '';
  });
  expect(href.startsWith('about:srcdoc') || href.startsWith('about:blank')).toBe(true);
});
