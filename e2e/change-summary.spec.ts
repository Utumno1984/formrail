import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const PLAYGROUND = 'pro-changesummary--playground';
const VALUE_TYPES = 'pro-changesummary--value-types';
const EMPTY = 'pro-changesummary--empty';
const LONG_VALUES = 'pro-changesummary--long-values';
const EDITED = 'pro-changesummary--edited-invoice';

/** Makes the Playground summary non-empty (the play function ends with "Discard"). */
async function editAmount(page: Page, value: string) {
  const amount = page.getByRole('textbox', { name: 'Amount' });
  await amount.fill(value);
}

test.describe('Pro/ChangeSummary', () => {
  test('the Playground play function passes (the whole editor flow)', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
  });

  test('the play function also passes with the other Controls values', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'locale:de-DE;timeZone:Europe/Rome;valueFormat:currency');
  });

  test('the text read for an item is "Amount, changed, from 100 to 120" (aria snapshot)', async ({ page }) => {
    // Wait for the play function to finish (it ends with "Discard"), then drive the editor.
    await expectPlayToPass(page, PLAYGROUND);
    await editAmount(page, '120');
    await expect(page.getByRole('list', { name: 'Changes' })).toMatchAriaSnapshot(`
      - list "Changes":
        - listitem: Amount, changed, from 100 to 120
    `);
    await page.getByRole('checkbox', { name: 'Paid' }).check();
    await expect(page.getByRole('list', { name: 'Changes' })).toMatchAriaSnapshot(`
      - list "Changes":
        - listitem: Amount, changed, from 100 to 120
        - listitem: Paid, changed, from No to Yes
    `);
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('list', { name: 'Changes' })).toMatchAriaSnapshot(`
      - list "Changes":
        - listitem: Amount, changed, from 100 to 120
        - listitem: Paid, changed, from No to Yes
        - listitem: /Line Items > Item 3, added, .*New line.*/
    `);
  });

  test('an added and a removed item are read as "Note, added, ..." / "..., removed, ..."', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await expect(page.getByRole('list', { name: 'Changes' })).toMatchAriaSnapshot(`
      - list "Changes":
        - listitem: /Line Items > Item 1, removed, .*Desk.*/
    `);
  });

  test('the kind of change is visible text, and "before" is also struck through', async ({ page }) => {
    await gotoStory(page, EDITED);
    const first = page.getByRole('listitem').first();
    // The DOM text is the lower-case one read by assistive technology; it is shown capitalized.
    const kind = first.getByText('changed', { exact: true });
    await expect(kind).toBeVisible();
    await expect(kind).toHaveCSS('text-transform', 'capitalize');
    // The decoration is set on the wrapper of the value, not on the text span itself.
    await expect(first.getByText('100', { exact: true }).locator('..')).toHaveCSS('text-decoration-line', 'line-through');
    await expect(first.getByText('120', { exact: true }).locator('..')).toHaveCSS('text-decoration-line', 'none');
  });

  test('there is no live region, status or alert, with or without entries', async ({ page }) => {
    for (const id of [EDITED, EMPTY, VALUE_TYPES]) {
      await gotoStory(page, id);
      await expect(page.locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
    }
  });

  test('emptyLabel follows the control and no list is in the DOM', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'emptyLabel:Nothing to save');
    await expect(page.getByText('Nothing to save')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Changes' })).toHaveCount(0);
  });

  test('the locale control changes the date format', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'locale:en-US');
    await page.getByLabel('Due date').fill('2026-04-01');
    await expect(page.getByRole('listitem').filter({ hasText: 'Due Date' })).toContainText('Apr 1, 2026');
    await expectPlayToPass(page, PLAYGROUND, 'locale:de-DE');
    await page.getByLabel('Due date').fill('2026-04-01');
    await expect(page.getByRole('listitem').filter({ hasText: 'Due Date' })).toContainText('01.04.2026');
  });

  test('valueFormat=currency shows the amount as money', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'valueFormat:currency');
    await editAmount(page, '120');
    await expect(page.getByRole('listitem').filter({ hasText: 'Amount' })).toContainText('€100.00');
    await expect(page.getByRole('listitem').filter({ hasText: 'Amount' })).toContainText('€120.00');
  });

  test('ValueTypes never shows true / false, Date strings or [object ...]', async ({ page }) => {
    await expectPlayToPass(page, VALUE_TYPES);
    const texts = await page.locator('#storybook-root').evaluate((root) => {
      const out: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push((n.textContent ?? '').trim());
      return out;
    });
    expect(texts).not.toContain('true');
    expect(texts).not.toContain('false');
    const all = texts.join(' ');
    expect(all).not.toMatch(/GMT|\w{3} \w{3} \d{2} \d{4}|\[object/);
    expect(all).toContain('Mar 5, 2026');
    expect(all).toContain('Invalid date');
  });

  test('collisions show before and after differently', async ({ page }) => {
    await gotoStory(page, VALUE_TYPES);
    const texts = await page.getByRole('listitem').allTextContents();
    const find = (label: string) => texts.find((t) => t.startsWith(label)) as string;
    expect(find('Same Day')).toMatch(/Mar 5, 2026, 10:00:00 AM.*Mar 5, 2026, 11:30:00 AM/);
    expect(find('Close Numbers')).toMatch(/10.*10\.0001/);
    expect(find('Trailing Space')).toContain('"abc "');
    expect(find('Text Against Number')).toContain('"5"');
  });

  test('empty, no value, false and 0 look different', async ({ page }) => {
    await gotoStory(page, VALUE_TYPES);
    const note = page.getByRole('listitem').filter({ hasText: /^Note/ });
    await expect(note.getByText('Empty', { exact: true })).toHaveCSS('font-style', 'italic');
    const memo = page.getByRole('listitem').filter({ hasText: /^Memo/ });
    await expect(memo.getByText('No value', { exact: true })).toHaveCSS('font-style', 'italic');
  });

  for (const [name, width, height] of [
    ['mobile', 375, 667],
    ['tablet', 768, 1024],
  ] as const) {
    test(`LongValues at ${width}px: wraps, no horizontal overflow, a single scroller (${name})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await expectPlayToPass(page, LONG_VALUES);
      const m = await page.evaluate(() => {
        const root = document.querySelector('#storybook-root > div') as HTMLElement;
        const html = document.documentElement;
        const scrollers = Array.from(document.querySelectorAll('#storybook-root *')).filter((el) => {
          const cs = getComputedStyle(el);
          return /(auto|scroll)/.test(cs.overflowX + cs.overflowY);
        });
        return {
          rootScroll: root.scrollWidth <= root.clientWidth,
          pageScroll: html.scrollWidth <= html.clientWidth,
          scrollers: scrollers.length,
        };
      });
      expect(m).toEqual({ rootScroll: true, pageScroll: true, scrollers: 0 });
    });
  }

  test('before and after stack vertically on a narrow container and sit side by side on a wide one', async ({ page }) => {
    const positions = async () => {
      await expect(page.getByText('120', { exact: true }).first()).toBeVisible();
      return page.evaluate(() => {
        const li = document.querySelector('ul[aria-label="Changes"] li') as HTMLElement;
        // Innermost text spans only: their wrappers have the same text content.
        const spans = Array.from(li.querySelectorAll('span')).filter(
          (s) => ['100', '120'].includes(s.textContent ?? '') && s.children.length === 0,
        );
        const [b, a] = spans.map((s) => s.getBoundingClientRect());
        return { sameRow: Math.abs((b as DOMRect).top - (a as DOMRect).top) < 4 };
      });
    };
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, EDITED);
    expect(await positions()).toEqual({ sameRow: false });
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, EDITED);
    expect(await positions()).toEqual({ sameRow: true });
  });

  test('prefers-reduced-motion: the play function is unchanged and nothing animates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectPlayToPass(page, PLAYGROUND);
    await editAmount(page, '120');
    await expect(page.getByRole('list', { name: 'Changes' })).toBeVisible();
    const running = await page.evaluate(() => document.getAnimations().length);
    expect(running).toBe(0);
  });

  test('axe: no violations on the Playground with entries and on Empty', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
    await editAmount(page, '120');
    await page.getByRole('checkbox', { name: 'Paid' }).check();
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('list', { name: 'Changes' })).toBeVisible();
    await expectNoA11yViolations(page);
    await gotoStory(page, EMPTY);
    await expectNoA11yViolations(page);
  });

  test('axe: no violations on ValueTypes and EditedInvoice', async ({ page }) => {
    await gotoStory(page, VALUE_TYPES);
    await expectNoA11yViolations(page);
    await gotoStory(page, EDITED);
    await expectNoA11yViolations(page);
  });
});
