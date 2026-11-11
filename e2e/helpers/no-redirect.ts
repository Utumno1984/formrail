import { expect, type Page } from '@playwright/test';

type MarkedWindow = Window & { __noRedirectMarker?: boolean };

/**
 * Opens `url` and proves, without a fixed sleep, that the page was NOT navigated away.
 *
 * The redirect of the site is an inline script that runs while the document is parsed, so by the
 * time `page.goto` resolves (load event) any redirect has already been started. What is left to
 * prove is that the document we are looking at is the one that was loaded: a marker set on its
 * `window` must survive a couple of rendered frames (a navigation would replace the document and
 * lose the marker, or destroy the execution context and make `evaluate` throw), and no top-level
 * navigation may have been committed after `goto`. All of it is event-driven (animation frames,
 * `framenavigated`), not a duration that a slow CI runner can outrun.
 */
export async function gotoAndStay(page: Page, url: string): Promise<void> {
  await page.goto(url);
  let navigations = 0;
  const onNavigated = (frame: unknown) => {
    if (frame === page.mainFrame()) navigations++;
  };
  page.on('framenavigated', onNavigated);
  try {
    await page.evaluate(() => {
      (window as MarkedWindow).__noRedirectMarker = true;
    });
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    expect(await page.evaluate(() => (window as MarkedWindow).__noRedirectMarker)).toBe(true);
    expect(navigations, 'no navigation committed after the page loaded').toBe(0);
  } finally {
    page.off('framenavigated', onNavigated);
  }
}
