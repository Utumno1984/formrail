import type { Page } from '@playwright/test';

// Shared by e2e/legacy-story-ids.spec.ts (complete build at `/`) and e2e/site/legacy-story-ids.spec.ts
// (Free and Pro deploy builds under the Pages prefix), ticket #516.

/** The redirect probe of .storybook/legacy-story-ids.mjs and where it lands. */
export const PROBE = {
  story: { old: 'internal-legacy-redirect-probe--default', new: 'internal-legacyredirecttarget--default' },
  docs: { old: 'internal-legacy-redirect-probe--docs', new: 'internal-docsauditwrapper--docs' },
} as const;

interface HistoryWindow extends Window {
  __ropInitialHref?: string;
  __ropHistoryCalls?: Array<[method: string, url: string | null]>;
}

/**
 * Records, in every frame, the URL the document was loaded with and every `pushState`/`replaceState`
 * (resolved to an absolute URL), from before the page's own scripts run: so a test can tell the redirect's
 * own `replaceState` (the first call, from the head) from Storybook's later ones, and prove that a preview
 * frame was loaded straight with the new id.
 */
export async function recordHistory(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as HistoryWindow;
    w.__ropInitialHref = location.href;
    w.__ropHistoryCalls = [];
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history);
      history[method] = (state: unknown, title: string, url?: string | URL | null) => {
        w.__ropHistoryCalls?.push([method, url == null ? null : new URL(url, location.href).href]);
        original(state, title, url);
      };
    }
  });
}

type Evaluable = Pick<Page, 'evaluate'>;

export function historyCalls(target: Evaluable): Promise<Array<[string, string | null]>> {
  return target.evaluate(() => (window as HistoryWindow).__ropHistoryCalls ?? []);
}

export function initialHref(target: Evaluable): Promise<string | undefined> {
  return target.evaluate(() => (window as HistoryWindow).__ropInitialHref);
}
