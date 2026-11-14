import type { Page } from '@playwright/test';

// Shared by e2e/legacy-story-ids.spec.ts (complete build at `/`) and e2e/site/legacy-story-ids.spec.ts
// (Free and Pro deploy builds under the Pages prefix), ticket #516.

/**
 * The redirect probes of .storybook/legacy-story-ids.mjs and where they land: `story` and `docs` in the Free and
 * complete builds, `pro` (a public Pro story: the Pro demo carries no internal fixture) in the Pro demo and
 * complete builds.
 */
export const PROBE = {
  story: { old: 'internal-legacy-redirect-probe--default', new: 'internal-legacyredirecttarget--default' },
  docs: { old: 'internal-legacy-redirect-probe--docs', new: 'internal-docsauditwrapper--docs' },
  pro: { old: 'internal-legacy-redirect-probe--pro', new: 'pro-rebasenotice--playground' },
} as const;

interface HistoryWindow extends Window {
  __ropHistoryCalls?: Array<[method: string, url: string | null]>;
}

/**
 * Records, in every frame, every `pushState`/`replaceState` (resolved to an absolute URL), from before the
 * page's own scripts run: so a test can tell the redirect's own `replaceState` (the first call, from the
 * head) from Storybook's later ones.
 */
export async function recordHistory(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as HistoryWindow;
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

/**
 * The URL the document was LOADED with (its Navigation Timing entry), which `history.replaceState` does not
 * change: the old URL for a page the redirect rewrote in place, the new one for a preview frame the manager
 * loaded straight with the new id. Not an init-script marker: Chromium may reuse a frame's initial
 * `about:blank` window for its first same-origin document, and a marker set there would read "about:blank".
 */
export function initialHref(target: Evaluable): Promise<string | undefined> {
  return target.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.name);
}
