import { expect, test } from '@playwright/test';

test('preview iframe supports internal multi-page routing', async ({ page }) => {
  await page.goto('/');

  const indexHtml = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="UTF-8" /><title>Home</title></head>',
    '<body>',
    '<h1 id="start">Home Page</h1>',
    '<a id="to-about" href="/about.html#team">Go to About</a>',
    '</body>',
    '</html>',
  ].join('');

  const aboutHtml = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="UTF-8" /><title>About</title></head>',
    '<body>',
    '<h1 id="about-title">About Page</h1>',
    '<section id="team">Team Section</section>',
    '<a id="to-home" href="/index.html#start">Back Home</a>',
    '</body>',
    '</html>',
  ].join('');

  await page.evaluate(
    ({ html, routes }) => {
      window.dispatchEvent(
        new CustomEvent('preview:swap', {
          detail: {
            html,
            pagePath: 'index.html',
            routes,
          },
        }),
      );
    },
    {
      html: indexHtml,
      routes: {
        'index.html': indexHtml,
        'about.html': aboutHtml,
      },
    },
  );

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
    return isVisible(blue) ? 'blue' : 'green';
  });

  const liveFrame = page.locator(`iframe[title="Preview slot ${liveSlot}"]`);
  await expect(liveFrame).toBeVisible();

  const frame = liveFrame.contentFrame();
  if (!frame) {
    throw new Error('Preview frame not available');
  }

  await expect(frame.locator('#start')).toHaveText('Home Page');
  await frame.locator('#to-about').click();
  await expect(frame.locator('#about-title')).toHaveText('About Page');
  await expect(frame.locator('#team')).toHaveText('Team Section');

  await frame.locator('#to-home').click();
  await expect(frame.locator('#start')).toHaveText('Home Page');
});

test('preview iframe supports hash navigation for section aliases', async ({ page }) => {
  await page.goto('/');

  const indexHtml = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<title>Hash Navigation</title>',
    '<style>',
    'html, body { margin: 0; padding: 0; }',
    'body { font-family: sans-serif; }',
    '.nav { position: sticky; top: 0; z-index: 10; background: #111; color: #fff; padding: 12px; }',
    '.nav ul { margin: 0; padding: 0; display: flex; gap: 16px; list-style: none; }',
    '.nav a { color: #fff; text-decoration: none; }',
    'section { min-height: 680px; padding: 24px; border-top: 1px solid #444; }',
    '</style>',
    '</head>',
    '<body>',
    '<header class="nav" data-pp-section="nav">',
    '  <ul>',
    '    <li><a id="go-about" href="#about">About</a></li>',
    '    <li><a id="go-services" href="#services">Services</a></li>',
    '    <li><a id="go-contact" href="#contact">Contact</a></li>',
    '  </ul>',
    '</header>',
    '<section data-pp-section="hero"><h1>Home</h1></section>',
    '<section data-pp-section="about"><h2>About section</h2></section>',
    '<section data-pp-section="services-list"><h2>Services section</h2></section>',
    '<section data-pp-section="contact"><h2>Contact section</h2></section>',
    '</body>',
    '</html>',
  ].join('');

  await page.evaluate((html) => {
    window.dispatchEvent(
      new CustomEvent('preview:swap', {
        detail: {
          html,
          pagePath: 'index.html',
          routes: {
            'index.html': html,
          },
        },
      }),
    );
  }, indexHtml);

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
    return isVisible(blue) ? 'blue' : 'green';
  });

  const liveFrame = page.locator(`iframe[title="Preview slot ${liveSlot}"]`);
  await expect(liveFrame).toBeVisible();

  const frame = liveFrame.contentFrame();
  if (!frame) {
    throw new Error('Preview frame not available');
  }

  const getScrollTop = async (): Promise<number> =>
    frame.locator('html').evaluate(() => {
      const doc = document;
      return (
        doc.scrollingElement?.scrollTop ??
        doc.documentElement.scrollTop ??
        doc.body.scrollTop ??
        0
      );
    });

  const initialTop = await getScrollTop();
  await frame.locator('#go-about').evaluate((element) => {
    (element as HTMLAnchorElement).click();
  });
  await expect.poll(getScrollTop).toBeGreaterThan(initialTop + 100);

  const aboutTop = await getScrollTop();
  await frame.locator('#go-services').evaluate((element) => {
    (element as HTMLAnchorElement).click();
  });
  await expect.poll(getScrollTop).toBeGreaterThan(aboutTop + 100);

  const servicesTop = await getScrollTop();
  await frame.locator('#go-contact').evaluate((element) => {
    (element as HTMLAnchorElement).click();
  });
  await expect.poll(getScrollTop).toBeGreaterThan(servicesTop + 100);
});
