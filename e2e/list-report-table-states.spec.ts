import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `data-listreporttable--${name}`;
const PLAYGROUND = STORY('playground');
const scroller = (page: Page): Locator => page.getByTestId('scroller');
// Sub-pixel tolerance of the layout (spec: +-1px).
const EPS = 1;

interface Footprint {
  table: { width: number; left: number };
  cols: number[];
  header: { top: number; height: number; left: number };
  scroller: { height: number };
  body: { height: number };
}

const footprint = (page: Page): Promise<Footprint> =>
  page.evaluate(() => {
    const root = document.querySelector('#storybook-root') as HTMLElement;
    const rect = (el: Element) => el.getBoundingClientRect();
    const table = root.querySelector('table')!;
    const header = root.querySelector('thead')!;
    const body = root.querySelector('tbody')!;
    return {
      table: { width: rect(table).width, left: rect(table).left },
      // the width of every column, read from its header cell (a <col> has no reliable box of its own)
      cols: Array.from(root.querySelectorAll('th')).map((th) => rect(th).width),
      header: { top: rect(header).top, height: rect(header).height, left: rect(header).left },
      scroller: { height: rect(root.querySelector('[data-testid="scroller"]')!).height },
      body: { height: rect(body).height },
    };
  });

const rowHeight = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = getComputedStyle(document.querySelector('[data-testid="scroller"]')!).getPropertyValue('--rop-list-report-row-height');
    const probe = document.createElement('div');
    probe.style.height = value;
    document.body.appendChild(probe);
    const px = probe.getBoundingClientRect().height;
    probe.remove();
    return px;
  });

/** Changes the args of the running story, the way the Controls panel does (the story is not re-mounted). */
async function setArgs(page: Page, storyId: string, updatedArgs: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ storyId, updatedArgs }) => {
      (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } }).__STORYBOOK_ADDONS_CHANNEL__.emit(
        'updateStoryArgs',
        { storyId, updatedArgs },
      );
    },
    { storyId, updatedArgs },
  );
}

const close = (a: number, b: number): void => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(EPS);

function expectSameFootprint(a: Footprint, b: Footprint): void {
  close(a.table.width, b.table.width);
  close(a.table.left, b.table.left);
  expect(a.cols).toHaveLength(b.cols.length);
  a.cols.forEach((w, i) => close(w, b.cols[i]!));
  close(a.header.top, b.header.top);
  close(a.header.height, b.header.height);
  close(a.header.left, b.header.left);
  close(a.scroller.height, b.scroller.height);
  close(a.body.height, b.body.height);
}

test.describe('Data/ListReportTable states: stories play', () => {
  for (const name of ['loading', 'empty', 'no-results', 'error-state', 'error-long-message', 'reloading', 'status-transitions']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('stable footprint', () => {
  test('loading -> empty -> error -> 3 rows: table, columns, header and body do not move', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'status:loading;dataset:empty');
    await expect(scroller(page)).toHaveAttribute('aria-busy', 'true');
    const loading = await footprint(page);
    const row = await rowHeight(page);
    // 5 skeleton rows, never shorter than 5 x the row height
    expect(loading.body.height).toBeGreaterThanOrEqual(5 * row - EPS);

    await setArgs(page, PLAYGROUND, { status: 'ready' });
    await expect(page.getByText('No data', { exact: true }).last()).toBeVisible();
    const empty = await footprint(page);
    expectSameFootprint(loading, empty);

    await setArgs(page, PLAYGROUND, { status: 'error' });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    const error = await footprint(page);
    expectSameFootprint(loading, error);

    await setArgs(page, PLAYGROUND, { status: 'ready', dataset: '3 rows' });
    await expect(page.locator('#storybook-root tbody tr:not([aria-hidden])')).toHaveCount(3);
    const data = await footprint(page);
    expectSameFootprint(loading, data);
    expect(data.body.height).toBeGreaterThanOrEqual(5 * row - EPS);
  });

  test('no results has the same footprint as loading', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'status:loading;dataset:empty');
    const loading = await footprint(page);
    await setArgs(page, PLAYGROUND, { status: 'ready', dataset: 'filter that excludes everything' });
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
    expectSameFootprint(loading, await footprint(page));
  });

  test('more rows than loadingRowCount: the body grows inside the scroller, the header stays', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'status:loading;dataset:empty');
    const loading = await footprint(page);
    await setArgs(page, PLAYGROUND, { status: 'ready', dataset: '200 rows' });
    await expect(page.locator('#storybook-root tbody tr')).toHaveCount(200);
    const many = await footprint(page);
    close(many.header.top, loading.header.top);
    close(many.table.width, loading.table.width);
    many.cols.forEach((w, i) => close(w, loading.cols[i]!));
    expect(many.body.height).toBeGreaterThan(loading.body.height);
    // one scroller: it is capped at maxHeight (360) and scrolls, the page does not
    close(many.scroller.height, 360);
    expect(await scroller(page).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  });

  test('loadingRowCount scales the footprint: 8 rows', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'status:loading;dataset:empty;loadingRowCount:8;maxHeight:700');
    const row = await rowHeight(page);
    const loading = await footprint(page);
    expect(loading.body.height).toBeGreaterThanOrEqual(8 * row - EPS);
    await setArgs(page, PLAYGROUND, { status: 'error' });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    expectSameFootprint(loading, await footprint(page));
  });

  test('loadingRowCount=0: no skeleton, one row of body, nothing breaks', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'status:loading;dataset:empty;loadingRowCount:0');
    await expect(page.locator('#storybook-root [data-rop-skeleton]')).toHaveCount(0);
    const loading = await footprint(page);
    const row = await rowHeight(page);
    expect(loading.body.height).toBeGreaterThanOrEqual(row - EPS);
    await setArgs(page, PLAYGROUND, { status: 'error' });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    close((await footprint(page)).header.top, loading.header.top);
  });

  test('skeleton rows have exactly the pitch of the data rows', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'status:loading;dataset:empty');
    const skeleton = await page.locator('#storybook-root [data-rop-skeleton]').evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
    await setArgs(page, PLAYGROUND, { status: 'ready', dataset: '3 rows' });
    await expect(page.locator('#storybook-root tbody tr:not([aria-hidden])')).toHaveCount(3);
    const data = await page.locator('#storybook-root tbody tr:not([aria-hidden])').evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
    for (const h of [...skeleton, ...data]) close(h, skeleton[0]!);
  });
});

test.describe('reload with data', () => {
  test('rows stay (same height), aria-busy, no skeleton, sortable headers still work', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'dataset:3 rows');
    const before = await footprint(page);
    await setArgs(page, PLAYGROUND, { status: 'loading' });
    await expect(scroller(page)).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#storybook-root [data-rop-skeleton]')).toHaveCount(0);
    await expect(page.locator('#storybook-root tbody tr:not([aria-hidden])')).toHaveCount(3);
    expectSameFootprint(before, await footprint(page));
    await page.getByRole('columnheader', { name: 'Amount' }).getByRole('button').click();
    await expect(page.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'ascending');
  });
});

test.describe('transitions without jumps', () => {
  test('loading -> error -> Retry -> loading -> data: page scroll and header position do not change', async ({ page }) => {
    // A short viewport makes the page itself scrollable.
    await page.setViewportSize({ width: 1000, height: 200 });
    await expectPlayToPass(page, PLAYGROUND, 'status:loading;dataset:empty');
    await page.evaluate(() => window.scrollTo(0, 60));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const state = () => page.evaluate(() => ({ y: window.scrollY, top: document.querySelector('thead')!.getBoundingClientRect().top }));
    const start = await state();

    await setArgs(page, PLAYGROUND, { status: 'error' });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(await state()).toEqual(start);

    await page.getByRole('button', { name: 'Retry' }).click();
    // the retry button is gone with the click's effect: the focus goes to the table container, not to body
    await setArgs(page, PLAYGROUND, { status: 'loading' });
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await expect(scroller(page)).toBeFocused();
    expect(await state()).toEqual(start);

    await setArgs(page, PLAYGROUND, { status: 'ready', dataset: '3 rows' });
    await expect(page.locator('#storybook-root tbody tr:not([aria-hidden])')).toHaveCount(3);
    expect(await state()).toEqual(start);
  });
});

test.describe('a Retry that changes nothing, then the user moves the focus away (#307)', () => {
  test('a later change of view that the click did not cause does not take the focus to the container', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'status:error;dataset:empty');
    const retry = page.getByRole('button', { name: 'Retry' });
    await retry.click();
    await expect(retry).toBeFocused();
    // the user clicks an empty area of the page: the focus goes back to body
    await page.mouse.click(5, 5);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    // later, a change of state that the click did not cause (a poll, a push)
    await setArgs(page, PLAYGROUND, { status: 'ready', dataset: '3 rows' });
    await expect(page.locator('#storybook-root tbody tr:not([aria-hidden])')).toHaveCount(3);
    await expect(scroller(page)).not.toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });
});

test.describe('"Clear filters"', () => {
  test('is shown only for no results; clicking it calls onClearFilters, shows the rows and keeps the focus on the container', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'dataset:filter that excludes everything');
    const table = page.getByRole('table', { name: 'Invoices' });
    await expect(table.getByText('No results for the current filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
    await expect(page.locator('#storybook-root tbody tr:not([aria-hidden])').first()).toBeVisible();
    await expect(scroller(page)).toBeFocused();
  });

  test('an empty dataset shows "No data" and no button', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'dataset:empty');
    await expect(page.getByRole('table').getByText('No data')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  });
});

test.describe('narrow container with a wide table', () => {
  test('the message sits in the visible part of the scroller, also after scrolling sideways (ltr)', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'dataset:empty;containerWidth:320');
    const box = page.locator('#storybook-root tbody [data-rop-state] > td > div');
    for (const left of [0, 150, 1000]) {
      await scroller(page).evaluate((el, x) => (el.scrollLeft = x), left);
      const s = await scroller(page).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, clientWidth: el.clientWidth, scrollable: el.scrollWidth > el.clientWidth };
      });
      expect(s.scrollable).toBe(true);
      const b = await box.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width };
      });
      expect(b.left).toBeGreaterThanOrEqual(s.left - EPS);
      expect(b.right).toBeLessThanOrEqual(s.right + EPS);
      close(b.width, s.clientWidth);
    }
  });

  test('rtl too', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'dataset:empty;containerWidth:320;dir:rtl');
    const box = page.locator('#storybook-root tbody [data-rop-state] > td > div');
    await scroller(page).evaluate((el) => (el.scrollLeft = -150));
    const s = await scroller(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    const b = await box.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    expect(b.left).toBeGreaterThanOrEqual(s.left - EPS);
    expect(b.right).toBeLessThanOrEqual(s.right + EPS);
  });
});

test.describe('announcements', () => {
  const region = (page: Page): Locator => page.locator('#storybook-root [aria-live="polite"]');

  test('the live region is there from the mount, empty; it announces each state and the count', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'dataset:3 rows');
    await expect(region(page)).toHaveCount(1);
    await expect(region(page)).toHaveText('');
    await setArgs(page, PLAYGROUND, { status: 'loading' });
    await expect(region(page)).toHaveText('Loading…');
    await setArgs(page, PLAYGROUND, { status: 'error' });
    await expect(region(page)).toHaveText('Unable to load data');
    await setArgs(page, PLAYGROUND, { status: 'ready' });
    await expect(region(page)).toHaveText('3 results');
    await setArgs(page, PLAYGROUND, { dataset: 'empty' });
    await expect(region(page)).toHaveText('No data');
    await setArgs(page, PLAYGROUND, { dataset: 'filter that excludes everything' });
    await expect(region(page)).toHaveText('No results for the current filters');
  });

  test('the region is the same node through the whole life of the table', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'dataset:3 rows');
    await region(page).evaluate((el) => ((window as unknown as { __live: Element }).__live = el));
    await setArgs(page, PLAYGROUND, { status: 'loading' });
    await setArgs(page, PLAYGROUND, { status: 'ready' });
    await expect(region(page)).toHaveText('3 results');
    expect(await region(page).evaluate((el) => el === (window as unknown as { __live: Element }).__live)).toBe(true);
  });
});

test.describe('accessibility and overflow', () => {
  for (const name of ['loading', 'empty', 'no-results', 'error-state', 'error-long-message', 'reloading']) {
    test(`${name}: axe finds no violations`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
      await expectNoA11yViolations(page, { include: '#storybook-root' });
    });
  }

  test('a long error message on a narrow box wraps inside the strip: the page does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await gotoStory(page, STORY('error-long-message'));
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('the skeleton is invisible to assistive technology', async ({ page }) => {
    await expectPlayToPass(page, STORY('loading'));
    await expect(page.getByRole('row')).toHaveCount(1); // only the header row is exposed
  });
});
