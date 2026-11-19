import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const PLAYGROUND = 'pro-changesummary--playground';
const VALUE_TYPES = 'pro-changesummary--value-types';
const EMPTY = 'pro-changesummary--empty';
const LONG_VALUES = 'pro-changesummary--long-values';
const EDITED = 'pro-changesummary--edited-invoice';
const NO_VALUE_STATES = 'pro-changesummary--no-value-states';

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

  test('the NoValueStates play function passes (the summary follows the dirty state)', async ({ page }) => {
    await expectPlayToPass(page, NO_VALUE_STATES);
  });

  test('a nullable field typed and cleared stays in the summary; a field with an empty baseline does not', async ({ page }) => {
    await expectPlayToPass(page, NO_VALUE_STATES);
    const note = page.getByRole('textbox', { name: 'Note' });
    await note.fill('abc');
    await note.fill('');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Changes' })).toMatchAriaSnapshot(`
      - list "Changes":
        - listitem: Note, added, Empty
    `);
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('list', { name: 'Changes' })).toHaveCount(0);

    const memo = page.getByRole('textbox', { name: 'Memo' });
    await memo.fill('abc');
    await memo.fill('');
    await expect(page.getByText('All saved')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Changes' })).toHaveCount(0);
    await expect(page.getByText('No changes')).toBeVisible();
  });

  test('two no-value states read differently and stay muted', async ({ page }) => {
    await expectPlayToPass(page, NO_VALUE_STATES);
    await page.getByRole('button', { name: 'Clear note to undefined' }).click();
    const list = page.getByRole('list', { name: 'Changes' });
    await expect(list).toMatchAriaSnapshot(`
      - list "Changes":
        - listitem: Note, changed, from Null to Undefined
    `);
    await expect(list.getByText('Null', { exact: true })).toHaveCSS('font-style', 'italic');
    await expect(list.getByText('Undefined', { exact: true })).toHaveCSS('font-style', 'italic');
    await expectNoA11yViolations(page);
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

const ROW_LABELS = 'pro-changesummary--row-labels-and-reorders';

test.describe('Pro/ChangeSummary: row labels and reorders (#424)', () => {
  test('the RowLabelsAndReorders play function passes, with rowLabels name (default) and position', async ({ page }) => {
    await expectPlayToPass(page, ROW_LABELS);
    await expectPlayToPass(page, ROW_LABELS, 'rowLabels:position');
  });

  test('an edit names its row; moves are listed as reorders, not as entries (aria snapshot)', async ({ page }) => {
    await expectPlayToPass(page, ROW_LABELS);
    await page.getByRole('textbox', { name: 'Price of Lamp' }).fill('18');
    await page.getByRole('button', { name: 'Move Lamp up' }).click();
    await page.getByRole('button', { name: 'Move ECO of Lamp up' }).click();
    await expect(page.getByRole('list', { name: 'Changes' })).toMatchAriaSnapshot(`
      - list "Changes":
        - listitem: Line Items > Item 2 (Lamp) > Price, changed, from 15 to 18
    `);
    await expect(page.getByRole('list', { name: 'Reordered lists' })).toMatchAriaSnapshot(`
      - list "Reordered lists":
        - listitem: "Order changed: Line Items"
        - listitem: "Order changed: Line Items > Item 2 (Lamp) > Taxes"
    `);
  });

  test('rowLabels position: the labels go back to Item N', async ({ page }) => {
    await expectPlayToPass(page, ROW_LABELS, 'rowLabels:position');
    await page.getByRole('textbox', { name: 'Price of Chair' }).fill('45');
    await page.getByRole('button', { name: 'Move ECO of Chair up' }).click();
    await expect(page.getByRole('list', { name: 'Changes' })).toMatchAriaSnapshot(`
      - list "Changes":
        - listitem: Line Items > Item 2 > Price, changed, from 40 to 45
    `);
    await expect(page.getByRole('list', { name: 'Reordered lists' })).toMatchAriaSnapshot(`
      - list "Reordered lists":
        - listitem: "Order changed: Line Items > Item 2 > Taxes"
    `);
  });

  test('EditedInvoice: the removed row and the changed row, both at position 1, carry their names', async ({ page }) => {
    await gotoStory(page, EDITED);
    await expect(page.getByRole('list', { name: 'Changes' })).toMatchAriaSnapshot(`
      - list "Changes":
        - listitem: /^Amount, changed, /
        - listitem: /^Paid, changed, /
        - listitem: /^Due Date, changed, /
        - listitem: Line Items > Item 1 (Chair) > Price, changed, from 40 to 45
        - listitem: /^Line Items > Item 2 \\(Cable\\), added, /
        - listitem: /^Line Items > Item 1 \\(Desk\\), removed, /
    `);
  });

  test('axe: no violations on RowLabelsAndReorders with entries and reorders', async ({ page }) => {
    await expectPlayToPass(page, ROW_LABELS);
    await page.getByRole('textbox', { name: 'Price of Chair' }).fill('45');
    await page.getByRole('button', { name: 'Move Chair up' }).click();
    await expect(page.getByRole('list', { name: 'Reordered lists' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('Pro/ChangeSummary: explicit empty state (#484)', () => {
  test('the Empty play function passes, also with a blank emptyLabel (default text)', async ({ page }) => {
    await expectPlayToPass(page, EMPTY);
    await expectPlayToPass(page, EMPTY, 'emptyLabel:+');
    await expect(page.getByRole('group', { name: 'Changes' })).toHaveText('No changes');
  });

  test('the empty state is a named group with the text and a hidden icon (aria snapshot)', async ({ page }) => {
    await gotoStory(page, EMPTY);
    await expect(page.getByRole('group', { name: 'Changes' })).toMatchAriaSnapshot(`
      - group "Changes":
        - paragraph: No changes
    `);
    await expect(page.getByRole('group', { name: 'Changes' }).locator('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('the box keeps its declared minimum height and matches a summary with one change', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
    const root = page.locator('.rop-pro-change-summary');
    const empty = (await root.boundingBox())!.height;
    const minHeight = await root.evaluate((el) => parseFloat(getComputedStyle(el).minHeight));
    expect(minHeight).toBeGreaterThan(0);
    expect(empty).toBeGreaterThanOrEqual(minHeight);
    await editAmount(page, '120');
    await expect(page.getByRole('list', { name: 'Changes' })).toBeVisible();
    const changed = (await root.boundingBox())!.height;
    // The same height as a summary with one change, give or take the rounding of the line heights.
    expect(Math.abs(empty - changed)).toBeLessThanOrEqual(8);
    // Nothing is animated or shown as a loading placeholder.
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    // Back to empty: the group (with its name) returns, at the same height.
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('group', { name: 'Changes' })).toHaveText('No changes');
    expect((await root.boundingBox())!.height).toBe(empty);
  });

  test('a very long emptyLabel wraps inside the box, on a narrow container too', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await expectPlayToPass(page, EMPTY, `emptyLabel:${'Nothing-to-save-yet-'.repeat(12)}`);
    const box = page.locator('.rop-pro-change-summary');
    const size = await box.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test.describe('kind badges (#485)', () => {
    test('the EditedInvoice play function passes (text, tint and shape of each badge)', async ({ page }) => {
      await expectPlayToPass(page, EDITED);
    });

    test('each kind has its own decorative shape and tint, with no node and no accessible text for the icon', async ({ page }) => {
      await gotoStory(page, EDITED);
      const info = await page.evaluate(() =>
        ['added', 'removed', 'changed'].map((kind) => {
          const el = document.querySelector(`.rop-pro-change-summary__kind--${kind}`) as HTMLElement;
          const before = getComputedStyle(el, '::before');
          return {
            text: el.textContent,
            children: el.children.length,
            content: before.content,
            shape: before.clipPath,
            width: before.width,
            tint: getComputedStyle(el).backgroundColor,
          };
        }),
      );
      expect(info.map((i) => i.text)).toEqual(['added', 'removed', 'changed']);
      for (const i of info) {
        expect(i.children).toBe(0);
        expect(i.content).toBe('""');
        expect(parseFloat(i.width)).toBeGreaterThan(4);
      }
      expect(new Set(info.map((i) => i.shape)).size).toBe(3);
      expect(new Set(info.map((i) => i.tint)).size).toBe(3);
    });

    test('forced-colors: the 1px outline and the icon are kept', async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active' });
      await gotoStory(page, EDITED);
      for (const kind of ['added', 'removed', 'changed']) {
        const badge = page.locator(`.rop-pro-change-summary__kind--${kind}`).first();
        await expect(badge).toHaveCSS('outline-width', '1px');
        await expect(badge).toHaveCSS('outline-style', 'solid');
        const icon = await badge.evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
        expect(icon).not.toBe('rgba(0, 0, 0, 0)');
      }
    });

    // 320px is the 200% zoom of a 640px viewport: the badge stays whole and inside the box.
    for (const [name, width] of [
      ['320px (200% zoom of 640px)', 320],
      ['375px', 375],
      ['1280px', 1280],
    ] as const) {
      test(`LongValues at ${name}: a badge next to a long label is one line and inside the box`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await expectPlayToPass(page, LONG_VALUES);
        const box = (await page.locator('.rop-pro-change-summary').boundingBox())!;
        const badges = page.locator('.rop-pro-change-summary__kind');
        expect(await badges.count()).toBe(2);
        for (let i = 0; i < 2; i++) {
          const b = (await badges.nth(i).boundingBox())!;
          expect(b.x).toBeGreaterThanOrEqual(box.x);
          expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
          // One line of the caption text: never split in the middle.
          expect(await badges.nth(i).evaluate((el) => el.getClientRects().length)).toBe(1);
          const lineHeight = await badges.nth(i).evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
          expect(b.height).toBeLessThan(lineHeight * 1.6);
        }
      });
    }

    // The icon is drawn by `::before` and a break opportunity sits between it and the text: at
    // some widths the diamond ended a line and the word started the next. The test makes the
    // unfavourable condition explicit (wider letters, bigger text) so it does not depend on the
    // fonts of the machine running it.
    for (const id of [EDITED, VALUE_TYPES, LONG_VALUES]) {
      for (const width of [320, 375]) {
        test(`${id} at ${width}px, with wide text: every badge is a single rectangle (icon and text never split)`, async ({ page }) => {
          await page.setViewportSize({ width, height: 1600 });
          await gotoStory(page, id);
          await page.locator('.rop-pro-change-summary__kind').first().waitFor();
          await page.addStyleTag({
            content: '.rop-pro-change-summary { font-size: 20px; letter-spacing: 0.12em; }',
          });
          const rects = await page.evaluate(() =>
            [...document.querySelectorAll('.rop-pro-change-summary__kind')].map((el) => ({
              text: el.textContent,
              rects: el.getClientRects().length,
            })),
          );
          expect(rects.length).toBeGreaterThan(0);
          expect(rects.filter((r) => r.rects !== 1)).toEqual([]);
        });
      }
    }

    // The icon is a `::before` out of the flow, so its place is only measurable from the computed
    // geometry: the box is the badge's first rect (position: relative) plus the resolved `left`
    // and `width` of the pseudo-element. It must sit wholly in the leading padding, before the
    // text in the reading direction: left of the text in LTR, right of it in RTL.
    for (const dir of ['ltr', 'rtl'] as const) {
      test(`the badge icon sits in the leading padding, before the text, with dir="${dir}"`, async ({ page }) => {
        await page.setViewportSize({ width: 800, height: 800 });
        await gotoStory(page, EDITED);
        await page.locator('.rop-pro-change-summary__kind').first().waitFor();
        await page.locator('.rop-pro-change-summary').evaluate((el, d) => el.setAttribute('dir', d), dir);
        const geo = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.rop-pro-change-summary__kind')].map((el) => {
            const badge = el.getClientRects()[0]!;
            const before = getComputedStyle(el, '::before');
            const left = badge.left + parseFloat(before.left);
            const iconWidth = parseFloat(before.width);
            const range = document.createRange();
            range.selectNodeContents(el);
            const text = range.getClientRects()[0]!;
            return {
              badge: { left: badge.left, right: badge.right },
              icon: { left, right: left + iconWidth },
              text: { left: text.left, right: text.right },
            };
          }),
        );
        expect(geo.length).toBeGreaterThan(0);
        for (const g of geo) {
          expect(g.icon.right - g.icon.left).toBeGreaterThan(0);
          // Inside the badge and clear of the text, with a sub-pixel tolerance.
          expect(g.icon.left).toBeGreaterThanOrEqual(g.badge.left - 0.5);
          expect(g.icon.right).toBeLessThanOrEqual(g.badge.right + 0.5);
          if (dir === 'ltr') {
            expect(g.icon.right).toBeLessThanOrEqual(g.text.left + 0.5);
          } else {
            expect(g.icon.left).toBeGreaterThanOrEqual(g.text.right - 0.5);
          }
        }
      });
    }
  });
});
