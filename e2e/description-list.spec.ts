import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const EPS = 1;
const PLAYGROUND = 'data-descriptionlist--playground';
const INLINE = 'data-descriptionlist--inline-mixed';
const STACKED = 'data-descriptionlist--stacked-mixed';
const SIDE_BY_SIDE = 'data-descriptionlist--auto-side-by-side';
const LONG = 'data-descriptionlist--long-and-empty';
const RTL = 'data-descriptionlist--rtl';
const EDGES = 'data-descriptionlist--edge-cases';

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** [dt box, dd box] of every item of a list, plus the top of the first thing drawn in each. */
async function itemsGeometry(list: Locator) {
  return list.evaluate((dl) =>
    Array.from(dl.children).map((item) => {
      const dt = item.querySelector('dt')!;
      const dd = item.querySelector('dd')!;
      const box = (el: Element): Box => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      // Top of the first text drawn in the cell (same measure for every type of value: the glyph
      // box of its first text node, so a link, a mono span or a button label are compared with the
      // label text like for like).
      const firstTop = (el: Element): number => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && !node.textContent?.trim()) node = walker.nextNode();
        const range = document.createRange();
        range.selectNodeContents(node ?? el);
        return range.getBoundingClientRect().top;
      };
      return { dt: box(dt), dd: box(dd), dtTop: firstTop(dt), ddTop: firstTop(dd) };
    }),
  );
}

const setWidth = (page: Page, width: number) =>
  page.getByTestId('container').evaluate((el, w) => {
    (el as HTMLElement).style.width = `${w}px`;
  }, width);

test.describe('Data/DescriptionList', () => {
  test('markup is a real description list and passes axe (mixed, empty, long values)', async ({ page }) => {
    for (const id of [INLINE, STACKED, SIDE_BY_SIDE, LONG, RTL, EDGES]) {
      await gotoStory(page, id);
      await expectNoA11yViolations(page);
    }
    await gotoStory(page, PLAYGROUND, 'valueKind:with-empties');
    await expect(page.locator('dl > div > dt')).toHaveCount(5);
    await expectNoA11yViolations(page);
    // The placeholder is visible, the accessible text is the hidden label.
    await expect(page.getByText('Not specified').first()).toBeAttached();
    await expect(page.getByText('—').first()).toBeVisible();
  });

  test('the Playground and AutoSideBySide play functions pass', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
    await expectPlayToPass(page, 'data-descriptionlist--auto-side-by-side');
  });

  test('auto: same 1280px viewport, 600px container is inline, 280px container is stacked (container query, not media query)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, SIDE_BY_SIDE);
    const wide = await itemsGeometry(page.getByTestId('list-600'));
    const narrow = await itemsGeometry(page.getByTestId('list-280'));
    for (const g of wide) {
      expect(g.dd.left).toBeGreaterThanOrEqual(g.dt.right);
      expect(Math.abs(g.dd.top - g.dt.top)).toBeLessThanOrEqual(EPS);
    }
    for (const g of narrow) {
      expect(g.dd.top).toBeGreaterThanOrEqual(g.dt.bottom - EPS);
      expect(Math.abs(g.dd.left - g.dt.left)).toBeLessThanOrEqual(EPS);
    }
  });

  test('resizing the container 600 -> 280 -> 600 switches inline/stacked/inline without remounting', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await page.getByTestId('list').evaluate((dl) => {
      (dl as unknown as { __marker: Element }).__marker = dl.querySelector('dd')!;
    });
    const state = async () => {
      const [g] = await itemsGeometry(page.getByTestId('list'));
      return g!.dd.top >= g!.dt.bottom - EPS ? 'stacked' : 'inline';
    };
    expect(await state()).toBe('inline');
    await setWidth(page, 280);
    await expect.poll(state).toBe('stacked');
    await setWidth(page, 600);
    await expect.poll(state).toBe('inline');
    const same = await page.getByTestId('list').evaluate((dl) => (dl as unknown as { __marker: Element }).__marker === dl.querySelector('dd'));
    expect(same).toBe(true);
  });

  test('forced layouts hold at 280px and 600px', async ({ page }) => {
    for (const width of [280, 600]) {
      await gotoStory(page, PLAYGROUND, `layout:inline;width:${width}`);
      for (const g of await itemsGeometry(page.getByTestId('list'))) {
        expect(g.dd.left).toBeGreaterThanOrEqual(g.dt.right);
      }
      await gotoStory(page, PLAYGROUND, `layout:stacked;width:${width}`);
      for (const g of await itemsGeometry(page.getByTestId('list'))) {
        expect(g.dd.top).toBeGreaterThanOrEqual(g.dt.bottom - EPS);
        expect(Math.abs(g.dd.left - g.dt.left)).toBeLessThanOrEqual(EPS);
      }
    }
  });

  test('exactly at the threshold the layout is deterministic (384px inline, 383px stacked)', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'width:384');
    expect((await itemsGeometry(page.getByTestId('list')))[0]!.dd.left).toBeGreaterThanOrEqual(
      (await itemsGeometry(page.getByTestId('list')))[0]!.dt.right,
    );
    await setWidth(page, 383);
    await expect
      .poll(async () => {
        const [g] = await itemsGeometry(page.getByTestId('list'));
        return g!.dd.top >= g!.dt.bottom - EPS;
      })
      .toBe(true);
  });

  test('the compiled container query condition comes from the theme token (a literal would not match)', async ({
    page,
  }) => {
    await gotoStory(page, PLAYGROUND);
    const { token, conditions } = await page.evaluate(() => {
      const found: string[] = [];
      const visit = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSContainerRule && rule.cssText.includes('subgrid')) found.push(rule.conditionText);
          if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
      return {
        token: getComputedStyle(document.documentElement).getPropertyValue('--container-rop-description-list').trim(),
        conditions: found,
      };
    });
    expect(token).not.toBe('');
    expect(conditions.length).toBeGreaterThan(0);
    // Tailwind writes the token's value into the condition: change the token and the query follows.
    for (const condition of conditions) expect(condition).toContain(token);
  });

  test('the <dl> is the measured container: a max-width/width on it changes the layout, display:none leaves no box', async ({
    page,
  }) => {
    await gotoStory(page, PLAYGROUND, 'layout:auto;width:800');
    const state = async () => {
      const [g] = await itemsGeometry(page.getByTestId('list'));
      return g!.dd.top >= g!.dt.bottom - EPS ? 'stacked' : 'inline';
    };
    const dl = page.getByTestId('list');
    expect(await state()).toBe('inline');
    // Same outer container (800px): only the <dl> box itself changes.
    await dl.evaluate((el) => (el.style.maxWidth = '300px'));
    await expect.poll(state).toBe('stacked');
    await dl.evaluate((el) => (el.style.maxWidth = ''));
    await expect.poll(state).toBe('inline');
    // An explicit width on the <dl> is measured too (not the width of its parent).
    await dl.evaluate((el) => (el.style.width = '200px'));
    await expect.poll(state).toBe('stacked');
    await dl.evaluate((el) => (el.style.width = ''));
    await expect.poll(state).toBe('inline');
    // `display: none` (a `className="hidden"` utility) leaves no box behind.
    await dl.evaluate((el) => (el.style.display = 'none'));
    expect((await page.getByTestId('container').boundingBox())!.height).toBeLessThan(40);
  });

  test('a value changed by a real re-render (string -> node -> empty -> multi-line) keeps the value column', async ({
    page,
  }) => {
    await gotoStory(page, 'data-descriptionlist--changing-value');
    const lefts: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const items = await itemsGeometry(page.getByTestId('list'));
      lefts.push(items[0]!.dd.left, items[1]!.dd.left);
      expect(Math.abs(items[0]!.ddTop - items[0]!.dtTop)).toBeLessThanOrEqual(EPS);
      // The second row never overlaps the first, whatever the first one holds.
      expect(items[1]!.dt.top).toBeGreaterThanOrEqual(items[0]!.dd.bottom - EPS);
      await page.getByRole('button', { name: 'Change value' }).click();
    }
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(EPS);
  });

  test('in a narrow Sheet the list follows the Sheet width, not the window width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, 'data-descriptionlist--in-narrow-sheet');
    const sheetList = page.getByTestId('sheet-list');
    await expect(sheetList).toBeVisible();
    const width = (await sheetList.boundingBox())!.width;
    expect(width).toBeLessThan(384);
    for (const g of await itemsGeometry(sheetList)) {
      expect(g.dd.top).toBeGreaterThanOrEqual(g.dt.bottom - EPS);
    }
    await expectNoHorizontalOverflow(sheetList);
  });

  test('inline: one value column, and strings and nodes follow the same alignment rule', async ({ page }) => {
    await gotoStory(page, INLINE);
    const items = await itemsGeometry(page.getByTestId('list'));
    expect(items.length).toBeGreaterThan(4);
    const left0 = items[0]!.dd.left;
    for (const g of items) {
      expect(Math.abs(g.dd.left - left0)).toBeLessThanOrEqual(EPS);
      expect(Math.abs(g.ddTop - g.dtTop)).toBeLessThanOrEqual(EPS);
    }
  });

  test('stacked: the dd is flush with the dt for every type of value', async ({ page }) => {
    await gotoStory(page, STACKED);
    for (const g of await itemsGeometry(page.getByTestId('list'))) {
      expect(Math.abs(g.dd.left - g.dt.left)).toBeLessThanOrEqual(EPS);
      expect(g.dd.top).toBeGreaterThanOrEqual(g.dt.bottom - EPS);
    }
  });

  test('the dd has the same computed layout styles whatever it holds (no branch for strings vs nodes)', async ({ page }) => {
    await gotoStory(page, INLINE);
    const styles = await page.getByTestId('list').evaluate((dl) =>
      Array.from(dl.querySelectorAll('dd')).map((dd) => {
        const cs = getComputedStyle(dd);
        return [
          cs.display,
          cs.textAlign,
          cs.alignSelf,
          cs.paddingTop,
          cs.paddingRight,
          cs.paddingBottom,
          cs.paddingLeft,
          cs.marginTop,
          cs.marginRight,
          cs.marginBottom,
          cs.marginLeft,
        ].join('|');
      }),
    );
    expect(new Set(styles).size).toBe(1);
  });

  test('a multi-line node does not overlap the next row and its label stays on top', async ({ page }) => {
    await gotoStory(page, INLINE);
    const items = await itemsGeometry(page.getByTestId('list'));
    const address = items[4]!;
    expect(address.dd.bottom - address.dd.top).toBeGreaterThan(40);
    expect(Math.abs(address.ddTop - address.dtTop)).toBeLessThanOrEqual(EPS);
    expect(items[5]!.dd.top).toBeGreaterThanOrEqual(address.dd.bottom - EPS);
  });

  test('long values and labels wrap without horizontal overflow; TruncatedText really truncates', async ({ page }) => {
    await gotoStory(page, LONG);
    for (const id of ['box-600', 'box-280']) {
      for (const box of await page.getByTestId(id).all()) {
        await expectNoHorizontalOverflow(box);
      }
    }
    const info = await page.getByTestId('list-280').first().evaluate((dl) => {
      const dd = dl.querySelectorAll('dd')[2]!;
      const text = dd.firstElementChild as HTMLElement;
      return { minWidth: getComputedStyle(dd).minWidth, truncated: text.scrollWidth > text.clientWidth };
    });
    expect(info.minWidth).toBe('0px');
    expect(info.truncated).toBe(true);
  });

  test('0 stays visible; null shows the placeholder (hidden text "Not specified")', async ({ page }) => {
    await gotoStory(page, LONG);
    const dds = page.getByTestId('list-600').locator('dd');
    await expect(dds.nth(3)).toContainText('Not specified');
    await expect(dds.nth(3).locator('[aria-hidden="true"]')).toHaveText('—');
    await expect(dds.nth(4)).toHaveText('0');
  });

  test('RTL: in inline the labels are on the right and nothing overflows', async ({ page }) => {
    await gotoStory(page, RTL);
    const items = await itemsGeometry(page.getByTestId('list'));
    for (const g of items) expect(g.dd.right).toBeLessThanOrEqual(g.dt.left + EPS);
    await expectNoHorizontalOverflow(page.getByTestId('container'));
  });

  test('edge cases: flex row item, table cell, empty list', async ({ page }) => {
    await gotoStory(page, EDGES);
    const flexList = await page.getByTestId('flex-list').boundingBox();
    expect(flexList!.width).toBeGreaterThan(100);
    const cellList = await page.getByTestId('cell-list').boundingBox();
    expect(cellList!.width).toBeGreaterThan(100);
    const [g] = await itemsGeometry(page.getByTestId('cell-list'));
    expect(g!.dd.left).toBeGreaterThanOrEqual(g!.dt.right);
    expect((await page.getByTestId('empty-list').boundingBox())!.height).toBe(0);
  });

  test('in a shrink-to-fit parent (auto-width cell, inline-block) the list keeps a readable width, not 0', async ({
    page,
  }) => {
    await gotoStory(page, EDGES);
    for (const id of ['auto-cell-list', 'shrink-list']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(128);
      const [g] = await itemsGeometry(page.getByTestId(id));
      // Stacked, and the label is not broken one character per line (one text line tall).
      expect(g!.dd.top).toBeGreaterThanOrEqual(g!.dt.bottom - EPS);
      expect(g!.dt.bottom - g!.dt.top).toBeLessThan(24);
    }
  });

  test('a value that changes after mount keeps the column (string -> node)', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    const before = await itemsGeometry(page.getByTestId('list'));
    await page.getByTestId('list').locator('dd').first().evaluate((dd) => {
      dd.innerHTML = '<a href="#x">cambiato</a>';
    });
    const after = await itemsGeometry(page.getByTestId('list'));
    expect(Math.abs(after[0]!.dd.left - before[0]!.dd.left)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(after[0]!.ddTop - after[0]!.dtTop)).toBeLessThanOrEqual(EPS);
  });

  test('a narrow viewport (200% zoom) still reflows without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 400 });
    await gotoStory(page, PLAYGROUND, 'width:500');
    await expectNoHorizontalOverflow(page.getByTestId('container'));
  });
});
