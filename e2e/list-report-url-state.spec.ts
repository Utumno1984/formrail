import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeDemoInvoices } from '../packages/core/src/internal/demo-invoices';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

// useListReportUrlState, on the iframe of the story: the URL of the page IS the state.
const STORY = 'floorplans-list-report--url-state';
const FIXTURE = 'floorplans-list-report--url-state-no-play';

const pill = (page: Page, name: string): Locator => page.getByRole('radio', { name });
const search = (page: Page): Locator => page.getByRole('searchbox', { name: 'Search' });
const amount = (page: Page): Locator => page.getByRole('button', { name: 'Amount' });
const table = (page: Page): Locator => page.getByRole('table', { name: 'Invoices' });
const bodyRows = (page: Page): Locator => table(page).locator('tbody tr:not([aria-hidden])');
const heading = (page: Page): Locator => page.getByRole('heading', { name: /Invoices/ });
const own = async (page: Page, prefix = ''): Promise<Record<string, string | null>> => {
  const search = new URL(page.url()).searchParams;
  const key = (name: string) => (prefix ? `${prefix}.${name}` : name);
  return { filter: search.get(key('filter')), q: search.get(key('q')), sort: search.get(key('sort')) };
};
const historyLength = (page: Page): Promise<number> => page.evaluate(() => window.history.length);

const ALL = makeDemoInvoices(200);
const OPEN_ROSSI = ALL.filter((r) => r.status === 'pending' && r.supplier.startsWith('Rossi')).sort(
  (a, b) => b.amount - a.amount,
);

/** Records the story's Actions events (the `fn()` callbacks), by name, from before the story renders. */
async function recordActions(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __actions: string[];
      __STORYBOOK_ADDONS_CHANNEL__?: { on: (e: string, cb: (p: { id?: string; data?: { name?: string } }) => void) => void };
    };
    w.__actions = [];
    let seen: Set<string> | undefined;
    const timer = setInterval(() => {
      if (!w.__STORYBOOK_ADDONS_CHANNEL__) return;
      clearInterval(timer);
      // Once, and each event once by id: with `page.clock` installed the polling interval above is a fake
      // timer, and the listener could otherwise be attached more than once (each event then counted N times).
      if (seen) return;
      seen = new Set();
      const ids = seen;
      w.__STORYBOOK_ADDONS_CHANNEL__.on('storybook/actions/action-event', (p) => {
        if (p.id !== undefined && ids.has(p.id)) return;
        if (p.id !== undefined) ids.add(p.id);
        w.__actions.push(p.data?.name ?? '?');
      });
    }, 1);
  });
  return () => page.evaluate(() => [...(window as unknown as { __actions: string[] }).__actions]);
}

test.describe('Floorplans/List Report: UrlState', () => {
  test('the play function passes (history replace, no prefix)', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await expect(pill(page, 'Open')).toBeChecked();
  });

  test('the play function passes with history push and a prefix', async ({ page }) => {
    await expectPlayToPass(page, STORY, 'history:push;prefix:inv');
    expect(await own(page, 'inv')).toEqual({ filter: 'open', q: 'rossi', sort: 'amount.desc' });
    expect(await own(page)).toEqual({ filter: null, q: null, sort: null });
  });

  test('no axe violations', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await expectNoA11yViolations(page);
  });

  test('smoke: pill, search with Enter, two clicks on Amount; the URL holds the view, the history did not grow, a reload restores it', async ({
    page,
  }) => {
    await gotoStory(page, FIXTURE);
    const length = await historyLength(page);
    await pill(page, 'Open').click();
    await search(page).fill('rossi');
    await search(page).press('Enter');
    await amount(page).click();
    await amount(page).click();
    expect(new URL(page.url()).search).toContain('filter=open&q=rossi&sort=amount.desc');
    expect(await historyLength(page)).toBe(length);
    // The rest of the iframe URL (story id, view mode) is untouched.
    expect(new URL(page.url()).searchParams.get('id')).toBe('floorplans-list-report--url-state-no-play');

    await page.reload();
    await expect(pill(page, 'Open')).toBeChecked();
    await expect(search(page)).toHaveValue('rossi');
    await expect(page.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending');
    await expect(bodyRows(page)).toHaveCount(OPEN_ROSSI.length);
    await expect(bodyRows(page).first()).toContainText(OPEN_ROSSI[0]!.number);
    await expect(heading(page)).toHaveText(`Invoices (${OPEN_ROSSI.length} of 200)`);
  });

  test('a hand-edited invalid URL shows the defaults, with no error and no rewrite', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
    });
    await page.goto(`/iframe.html?id=${FIXTURE}&viewMode=story&filter=xyz&sort=amount.sideways&q=`);
    await expect(pill(page, 'All')).toBeChecked();
    await expect(bodyRows(page)).toHaveCount(200);
    await expect(page.getByRole('columnheader', { name: 'Amount' })).not.toHaveAttribute('aria-sort');
    const search = new URL(page.url()).searchParams;
    expect(search.get('filter')).toBe('xyz');
    expect(search.get('sort')).toBe('amount.sideways');
    expect(errors.filter((e) => /react-object-page|useListReport|Warning|Error/i.test(e))).toEqual([]);
  });

  test('push: two pill changes, then Back selects the previous pill again with no onFilterChange', async ({ page }) => {
    const actions = await recordActions(page);
    await gotoStory(page, FIXTURE, 'history:push');
    const length = await historyLength(page);
    await pill(page, 'Open').click();
    await pill(page, 'Approved').click();
    expect(await historyLength(page)).toBe(length + 2);
    expect((await own(page)).filter).toBe('approved');
    await expect.poll(actions).toEqual(['onFilterChange', 'onFilterChange']);

    await page.goBack();
    await expect(pill(page, 'Open')).toBeChecked();
    expect((await own(page)).filter).toBe('open');
    await expect(bodyRows(page)).toHaveCount(ALL.filter((r) => r.status === 'pending').length);
    await page.goBack();
    await expect(pill(page, 'All')).toBeChecked();
    expect((await own(page)).filter).toBeNull();
    await page.goForward();
    await expect(pill(page, 'Open')).toBeChecked();
    // Navigation is not a gesture: still only the two clicks, and no entry was added or rewritten.
    expect(await actions()).toEqual(['onFilterChange', 'onFilterChange']);
    expect(await historyLength(page)).toBe(length + 2);
  });

  test('push: five typed characters committed by the delay add one entry; the draft never reaches the URL', async ({ page }) => {
    await page.clock.install();
    await gotoStory(page, FIXTURE, 'history:push');
    await page.evaluate(() => {
      const w = window as unknown as { __urls: string[] };
      w.__urls = [];
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = window.history[method].bind(window.history);
        window.history[method] = (...args: Parameters<History['pushState']>) => {
          original(...args);
          w.__urls.push(window.location.search);
        };
      }
    });
    const length = await historyLength(page);
    // The page's clock stands still while typing, so the five keystrokes surely fall within the 300 ms
    // commit delay however loaded the machine is; then it runs past the delay.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    await search(page).pressSequentially('rossi');
    await expect(search(page)).toHaveValue('rossi');
    expect(await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls)).toEqual([]);
    await page.clock.runFor(1_000);
    await expect.poll(async () => (await own(page)).q).toBe('rossi');
    const urls = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls);
    expect(urls).toHaveLength(1);
    expect(new URLSearchParams(urls[0]).get('q')).toBe('rossi');
    expect(await historyLength(page)).toBe(length + 1);
  });

  test('Back that moves only the pill while the user is typing: no write and no onSearchQueryChange', async ({ page }) => {
    const actions = await recordActions(page);
    await page.clock.install();
    await gotoStory(page, FIXTURE, 'history:push');
    await pill(page, 'Open').click();
    await pill(page, 'Approved').click();
    expect(await actions()).toEqual(['onFilterChange', 'onFilterChange']);
    const length = await historyLength(page);
    await page.evaluate(() => {
      const w = window as unknown as { __writes: string[] };
      w.__writes = [];
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = window.history[method].bind(window.history);
        window.history[method] = (...args: Parameters<History['pushState']>) => {
          w.__writes.push(method);
          original(...args);
        };
      }
    });
    // The page's clock stands still: Back surely arrives while the 300 ms commit of "ross" is pending.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    await search(page).pressSequentially('ross');
    await page.goBack();
    await expect(pill(page, 'Open')).toBeChecked();
    await page.clock.runFor(2_000); // well past the commit delay
    await page.clock.resume();
    expect(await page.evaluate(() => (window as unknown as { __writes: string[] }).__writes)).toEqual([]);
    expect(await own(page)).toEqual({ filter: 'open', q: null, sort: null });
    await expect(search(page)).toHaveValue('ross');
    expect(await actions()).toEqual(['onFilterChange', 'onFilterChange']);
    expect(await historyLength(page)).toBe(length);
    // Forward is still there: the navigation was not cut by a write.
    await page.goForward();
    await expect(pill(page, 'Approved')).toBeChecked();
    // The text is still the user's: Enter commits it now, as a gesture.
    await search(page).press('Enter');
    expect((await own(page)).q).toBe('ross');
  });

  test('Back that moves only the sort while the user is typing: no write and no onSearchQueryChange', async ({ page }) => {
    const actions = await recordActions(page);
    await page.clock.install();
    await gotoStory(page, FIXTURE, 'history:push');
    await amount(page).click(); // asc
    await amount(page).click(); // desc
    expect(await actions()).toEqual(['onSortChange', 'onSortChange']);
    const length = await historyLength(page);
    await page.evaluate(() => {
      const w = window as unknown as { __writes: string[] };
      w.__writes = [];
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = window.history[method].bind(window.history);
        window.history[method] = (...args: Parameters<History['pushState']>) => {
          w.__writes.push(method);
          original(...args);
        };
      }
    });
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    await search(page).pressSequentially('ross');
    await page.goBack();
    await expect(page.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'ascending');
    await page.clock.runFor(2_000);
    await page.clock.resume();
    expect(await page.evaluate(() => (window as unknown as { __writes: string[] }).__writes)).toEqual([]);
    expect((await own(page)).q).toBeNull();
    await expect(search(page)).toHaveValue('ross');
    expect(await actions()).toEqual(['onSortChange', 'onSortChange']);
    expect(await historyLength(page)).toBe(length);
    await page.goForward();
    await expect(page.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending');
  });

  test('Back while the user is typing: the field keeps the text, the table follows the URL, the pending commit is dropped', async ({
    page,
  }) => {
    const actions = await recordActions(page);
    await page.clock.install();
    await gotoStory(page, FIXTURE, 'history:push;searchCommitDelay:800');
    await search(page).fill('bianchi');
    await search(page).press('Enter');
    await search(page).fill('rossi');
    await search(page).press('Enter');
    expect((await own(page)).q).toBe('rossi');
    const length = await historyLength(page);
    // The page's clock stands still: Back surely arrives while the 800 ms commit of the draft is pending.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    await search(page).press('Backspace'); // draft "ross", committed "rossi"
    await page.goBack();
    await expect(search(page)).toHaveValue('ross');
    const bianchi = ALL.filter((r) => r.supplier.toLowerCase().includes('bianchi')).length;
    await expect(bodyRows(page)).toHaveCount(bianchi);
    await expect(heading(page)).toHaveText(`Invoices (${bianchi} of 200)`);
    await page.clock.runFor(2_000); // well past the commit delay
    await page.clock.resume();
    expect((await own(page)).q).toBe('bianchi');
    await expect(search(page)).toHaveValue('ross');
    expect(await historyLength(page)).toBe(length);
    expect(await actions()).toEqual(['onSearchQueryChange', 'onSearchQueryChange']);

    // Not typing (the field equals the committed value): Forward makes the field follow.
    await search(page).fill('bianchi');
    await page.goForward();
    await expect(search(page)).toHaveValue('rossi');
    await expect(bodyRows(page)).toHaveCount(ALL.filter((r) => r.supplier.startsWith('Rossi')).length);
    expect(await actions()).toEqual(['onSearchQueryChange', 'onSearchQueryChange']);
  });
});
