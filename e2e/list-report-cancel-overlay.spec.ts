import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #130: "New" opens a Dialog/Sheet above a mounted List Report; closing it must leave the report as it
// was (same DOM node, same scroll, pill, search, sort) and give the focus back to "New".
// The table scroller is the table's parent. The search term "FT-2026-00" matches the first 99 invoice
// numbers: with the "Open" pill there are still enough rows to scroll well past 600px.
const STORY = 'floorplans-list-report--cancel-action-overlay-no-play';
const LOADING_STORY = 'floorplans-list-report--cancel-action-overlay-loading';
const SEARCH = 'FT-2026-00';

const table = (page: Page): Locator => page.getByRole('table', { name: /Invoices/ });
const scroller = (page: Page): Locator => table(page).locator('..');
const newButton = (page: Page): Locator => page.getByRole('button', { name: 'New', exact: true });
const searchbox = (page: Page): Locator => page.getByRole('searchbox', { name: 'Search' });
// CSS, not a role query: with a modal open the page behind is aria-hidden.
const heading = (page: Page): Locator => page.locator('#storybook-root h2');
const overlay = (page: Page): Locator => page.getByRole('dialog', { name: 'New invoice' });

const TALL_STORY = 'floorplans-list-report--cancel-action-overlay-tall-page';

const open = async (
  page: Page,
  story = STORY,
  overlayKind: 'dialog' | 'sheet' = 'dialog',
  extraArgs = '',
): Promise<void> => {
  await gotoStory(page, story, `overlay:${overlayKind}${extraArgs ? `;${extraArgs}` : ''}`);
  await expect(table(page)).toBeVisible();
};

/** Pill, committed search and sort, then scroll the table (down, and sideways where it is wider than its box). */
async function prepare(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Open' }).click();
  await searchbox(page).fill(SEARCH);
  await searchbox(page).press('Enter');
  await page.getByRole('button', { name: 'Amount' }).click();
  await expect(heading(page)).toContainText(' of 200)');
  const left = await scroller(page).evaluate((el) => {
    el.scrollTop = 700;
    el.scrollLeft = Math.min(120, el.scrollWidth - el.clientWidth);
    return el.scrollLeft;
  });
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBe(700);
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollLeft)).toBe(left);
}

interface State {
  top: number;
  left: number;
  width: number;
  heading: string;
  firstRow: string;
}

const snapshot = (page: Page): Promise<State> =>
  page.evaluate(() => {
    const t = document.querySelector('#storybook-root table')!;
    const s = t.parentElement!;
    return {
      top: s.scrollTop,
      left: s.scrollLeft,
      width: s.getBoundingClientRect().width,
      heading: document.querySelector('#storybook-root h2')!.textContent ?? '',
      firstRow: t.querySelectorAll('tbody tr')[0]?.textContent ?? '',
    };
  });

async function expectRestored(page: Page, before: State): Promise<void> {
  await expect(overlay(page)).toHaveCount(0);
  const after = await snapshot(page);
  expect(after).toEqual(before);
  await expect(page.getByRole('radio', { name: 'Open' })).toBeChecked();
  await expect(searchbox(page)).toHaveValue(SEARCH);
  await expect(newButton(page)).toBeFocused();
}

type Closer = (page: Page) => Promise<void>;
const CLOSERS: Record<string, Closer> = {
  Cancel: async (page) => {
    await overlay(page).getByRole('button', { name: 'Cancel' }).click();
  },
  Escape: async (page) => {
    await page.keyboard.press('Escape');
  },
  'click on the backdrop': async (page) => {
    // The top-left corner is outside the centred Dialog and outside a right-hand Sheet.
    await page.mouse.click(4, 4);
  },
};

for (const kind of ['dialog', 'sheet'] as const) {
  test.describe(`${kind} above the List Report (default viewport)`, () => {
    for (const [name, close] of Object.entries(CLOSERS)) {
      test(`closing with ${name} leaves the report untouched and the focus on "New"`, async ({ page }) => {
        await open(page, STORY, kind);
        await prepare(page);
        const node = await table(page).elementHandle();
        const listNode = await heading(page).locator('xpath=ancestor::div[1]').elementHandle();
        const before = await snapshot(page);
        expect(before.top).toBe(700);

        await newButton(page).click();
        await expect(overlay(page)).toBeVisible();
        // Scroll, scrollbar layout and the lock of the body: already settled while the overlay is open.
        expect(await snapshot(page)).toEqual(before);

        await close(page);
        await expectRestored(page, before);
        // Same DOM nodes: the report was never remounted.
        expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
        expect(await page.evaluate((el) => document.querySelector('#storybook-root table') === el, node)).toBe(true);
        expect(await page.evaluate((el) => el!.isConnected, listNode)).toBe(true);
      });
    }

    for (const reduced of [false, true]) {
      test(`the focus returns to "New" ${reduced ? 'with' : 'without'} prefers-reduced-motion`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
        await open(page, STORY, kind);
        await newButton(page).click();
        await expect(overlay(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(overlay(page)).toHaveCount(0);
        await expect(newButton(page)).toBeFocused();
        await newButton(page).click();
        await overlay(page).getByRole('button', { name: 'Cancel' }).click();
        await expect(newButton(page)).toBeFocused();
      });
    }

    test('opening and closing three times in a row does not drift the scroll', async ({ page }) => {
      await open(page, STORY, kind);
      await prepare(page);
      const before = await snapshot(page);
      for (let i = 0; i < 3; i += 1) {
        await newButton(page).click();
        await expect(overlay(page)).toBeVisible();
        await overlay(page).getByRole('button', { name: 'Cancel' }).click();
        await expectRestored(page, before);
      }
    });

    for (const closer of ['Cancel', 'Escape'] as const) {
      test(`search text typed and not committed survives opening "New" and closing with ${closer}`, async ({ page }) => {
        // A commit delay of a minute: effectively "Enter only" for the length of the test.
        await open(page, STORY, kind, 'searchCommitDelay:60000');
        await prepare(page);
        const before = await snapshot(page);
        // Typed, and "New" is clicked at once: no Enter.
        await searchbox(page).press('End');
        await searchbox(page).pressSequentially('1');
        await newButton(page).click();
        await expect(overlay(page)).toBeVisible();
        await CLOSERS[closer]!(page);
        await expect(overlay(page)).toHaveCount(0);
        // useListReport documents it: the draft is kept, nothing is committed on blur or on losing the focus,
        // so the rows (heading count, first row) are those of the committed query.
        await expect(searchbox(page)).toHaveValue(`${SEARCH}1`);
        expect(await snapshot(page)).toEqual(before);
        await expect(newButton(page)).toBeFocused();
        await searchbox(page).press('Enter');
        await expect(heading(page)).not.toHaveText(before.heading);
      });
    }

    test('text typed inside the debounce window: the commit fires behind the open overlay, the text and the scroll stay', async ({
      page,
    }) => {
      // Default delay (300 ms). A trailing space changes the draft but not the matching rows, so the
      // scroll position stays comparable whether or not the commit happens.
      await open(page, STORY, kind);
      await prepare(page);
      const before = await snapshot(page);
      await searchbox(page).press('End');
      await searchbox(page).pressSequentially(' ');
      await newButton(page).click();
      await expect(overlay(page)).toBeVisible();
      // Wait well past the debounce with the overlay open.
      await page.waitForTimeout(900);
      await expect(overlay(page)).toBeVisible();
      expect(await snapshot(page)).toEqual(before);
      await CLOSERS.Escape!(page);
      await expect(overlay(page)).toHaveCount(0);
      // Documented outcome: the draft is still in the field (the commit did not clear or rewrite it),
      // the rows and the scroll are those of the query (whitespace does not change the match).
      await expect(searchbox(page)).toHaveValue(`${SEARCH} `);
      expect(await snapshot(page)).toEqual(before);
      await expect(newButton(page)).toBeFocused();
    });

    test('the report loading when "New" opens: data arriving behind the overlay, the focus still returns to "New"', async ({
      page,
    }) => {
      await open(page, LOADING_STORY, kind);
      await expect(table(page).locator('[data-rop-skeleton]').first()).toBeVisible();
      await newButton(page).click();
      await expect(overlay(page)).toBeVisible();
      // Precondition: the data has not arrived yet when the overlay is up (it arrives 1.5 s after mount).
      await expect(page.locator('#storybook-root [data-rop-skeleton]').first()).toBeVisible();
      // The rows arrive (1.5 s after mount) while the overlay is open.
      await expect(heading(page)).toContainText('(200)');
      await expect(overlay(page)).toBeVisible();
      await overlay(page).getByRole('button', { name: 'Cancel' }).click();
      await expect(overlay(page)).toHaveCount(0);
      await expect(newButton(page)).toBeFocused();
      await expect(table(page).locator('tbody tr').first()).toBeVisible();
    });
  });
}

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`Sheet above the List Report, ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    // On a 390px screen the 30rem Sheet is capped at the viewport width (`max-w-full`): it covers the
    // whole screen, so there is no backdrop left to click.
    const closers = Object.entries(CLOSERS).filter(([name]) => !(vp.width < 480 && name === 'click on the backdrop'));
    for (const [name, close] of closers) {
      test(`closing with ${name} leaves scroll, filters and focus as they were`, async ({ page }) => {
        await open(page, STORY, 'sheet');
        await prepare(page);
        const before = await snapshot(page);
        // The table is wider than its box on a phone: the horizontal position is a real value to preserve.
        if (vp.width < 480) expect(before.left).toBeGreaterThan(0);
        await newButton(page).click();
        await expect(overlay(page)).toBeVisible();
        expect(await snapshot(page)).toEqual(before);
        await close(page);
        await expectRestored(page, before);
      });
    }

    test('focusing the text field in the Sheet does not move the table scroll', async ({ page }) => {
      await open(page, STORY, 'sheet');
      await prepare(page);
      const before = await snapshot(page);
      await newButton(page).click();
      const field = overlay(page).getByRole('textbox', { name: 'Supplier name' });
      await field.click();
      await expect(field).toBeFocused();
      await field.pressSequentially('Acme');
      expect(await snapshot(page)).toEqual(before);
      await overlay(page).getByRole('button', { name: 'Cancel' }).click();
      await expectRestored(page, before);
    });
  });
}

for (const kind of ['dialog', 'sheet'] as const) {
  test(`the CancelActionOverlay play function passes (${kind})`, async ({ page }) => {
    await expectPlayToPass(page, 'floorplans-list-report--cancel-action-overlay', `overlay:${kind}`);
  });
}

// Headless Chromium hides scrollbars by default (`--hide-scrollbars`), which would make the scroll-lock
// layout-shift check vacuous: here they are visible, and the page really scrolls.
// `launchOptions` cannot be set per describe group, so the whole file runs with visible scrollbars.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test.describe('visible page scrollbar: the scroll-lock does not shift the table container', () => {
  for (const kind of ['dialog', 'sheet'] as const) {
    test(`${kind}: container width identical before, during and after`, async ({ page }) => {
      await open(page, TALL_STORY, kind);
      // Precondition: a classic scrollbar takes space from the viewport (otherwise the test proves nothing).
      const bar = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
      expect(bar).toBeGreaterThan(0);
      await prepare(page);
      const before = await snapshot(page);
      await newButton(page).click();
      await expect(overlay(page)).toBeVisible();
      const during = await snapshot(page);
      expect(during.width).toBe(before.width);
      expect(during).toEqual(before);
      await overlay(page).getByRole('button', { name: 'Cancel' }).click();
      await expectRestored(page, before);
    });
  }
});

test('the Dialog field keeps the table scroll too', async ({ page }) => {
  await open(page, STORY, 'dialog');
  await prepare(page);
  const before = await snapshot(page);
  await newButton(page).click();
  const field = overlay(page).getByRole('textbox', { name: 'Supplier name' });
  await field.click();
  await field.pressSequentially('Acme');
  expect(await snapshot(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await expectRestored(page, before);
});
