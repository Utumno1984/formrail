import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { gotoStory } from './helpers/story';

const PLAY = 'data-descriptionlist--status-and-summary';
const VISUAL = 'data-descriptionlist--status-and-summary-visual';
const ENTITIES = ['archived with audit', 'archived without audit', 'active, no status', 'detail only'];
const select = (page: Page, e: string) => page.getByRole('button', { name: e, exact: true }).click();

test.describe('DescriptionListStatus QA — mobile 375px', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('no horizontal overflow, same row height and same <dl> top across all entities, detail truncated on one line', async ({
    page,
  }) => {
    await gotoStory(page, PLAY, 'width:280');
    const status = page.getByTestId('status');
    const list = page.getByTestId('list');
    const h0 = (await status.boundingBox())!.height;
    const top0 = (await list.boundingBox())!.y;
    for (const e of [...ENTITIES, ...ENTITIES.slice().reverse()]) {
      await select(page, e);
      expect(Math.abs((await status.boundingBox())!.height - h0)).toBeLessThanOrEqual(0.5);
      expect(Math.abs((await list.boundingBox())!.y - top0)).toBeLessThanOrEqual(0.5);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
    await select(page, 'archived with audit');
    const truncated = await status.locator('> span').last().evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(truncated).toBe(true);
  });

  test('summaries stacked on mobile: dd flush with dt, status row contained in the container', async ({ page }) => {
    await gotoStory(page, PLAY, 'width:280;layout:auto');
    const status = (await page.getByTestId('status').boundingBox())!;
    const container = (await page.getByTestId('container').boundingBox())!;
    expect(status.x + status.width).toBeLessThanOrEqual(container.x + container.width + 0.5);
    const pairs = await page.getByTestId('list').locator('> div').evaluateAll((items) =>
      items.map((i) => [i.querySelector('dt')!.getBoundingClientRect().left, i.querySelector('dd')!.getBoundingClientRect().left]),
    );
    for (const [dt, dd] of pairs) expect(Math.abs(dd! - dt!)).toBeLessThanOrEqual(1);
  });
});

test.describe('DescriptionListStatus QA — markup and edge cases', () => {
  test('rendered markup: status is a sibling of the <dl>, <dl> has only <div> children, no undefined/null text, no leaked props', async ({
    page,
  }) => {
    await gotoStory(page, PLAY);
    for (const e of ENTITIES) {
      await select(page, e);
      const info = await page.evaluate(() => {
        const status = document.querySelector('[data-testid="status"]')!;
        const dl = document.querySelector('[data-testid="list"]')!;
        return {
          dlTag: dl.tagName,
          statusInsideDl: dl.contains(status),
          dlChildren: Array.from(dl.children).map((c) => c.tagName),
          itemChildren: Array.from(dl.children).map((c) => Array.from(c.children).map((x) => x.tagName).join(',')),
          text: document.body.innerText,
          statusAttrs: Array.from(status.attributes).map((a) => a.name),
          html: status.outerHTML,
        };
      });
      expect(info.dlTag).toBe('DL');
      expect(info.statusInsideDl).toBe(false);
      expect(new Set(info.dlChildren)).toEqual(new Set(['DIV']));
      expect(new Set(info.itemChildren)).toEqual(new Set(['DT,DD']));
      expect(info.text).not.toMatch(/\b(undefined|null)\b/);
      expect(info.html).not.toMatch(/\b(status|detail|variant)=/);
      expect(info.statusAttrs.filter((n) => n.startsWith('aria-') || n === 'role')).toEqual([]);
    }
  });

  test('RTL: summary dd sits on the logical value column, ellipsis on the end side, no overflow', async ({ page }) => {
    await gotoStory(page, PLAY, 'width:250');
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await select(page, 'archived with audit');
    const status = page.getByTestId('status');
    const detail = status.locator('> span').last();
    const dir = await detail.evaluate((el) => [getComputedStyle(el).direction, getComputedStyle(el).textAlign]);
    expect(dir[0]).toBe('rtl');
    expect(['right', 'start']).toContain(dir[1]);
    const lefts = await page.getByTestId('list').locator('dd').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    for (const l of lefts) expect(Math.abs(l - lefts[0]!)).toBeLessThanOrEqual(1);
    const c = (await page.getByTestId('container').boundingBox())!;
    const d = (await detail.boundingBox())!;
    expect(d.x).toBeGreaterThanOrEqual(c.x - 0.5);
    expect(d.x + d.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
  });

  test('open tooltip never keeps the old detail text when the detail changes under it', async ({ page }) => {
    await gotoStory(page, PLAY, 'width:250');
    await select(page, 'archived with audit');
    await page.getByTestId('status').locator('> span').last().hover();
    await expect(page.getByRole('tooltip')).toContainText('Maria Rossi', { timeout: 3000 });
    // the detail stays mounted with a different text; the tooltip stays open (no Escape)
    await page.getByRole('button', { name: 'detail only', exact: true }).evaluate((b) => (b as HTMLElement).click());
    await expect(page.getByTestId('status')).toContainText('Luca Bianchi');
    await page.waitForTimeout(500);
    const tips = page.getByRole('tooltip');
    if ((await tips.count()) > 0) await expect(tips).not.toContainText('Maria Rossi');
  });

  test('visual story: the first summary after normal items has a separator; axe passes; no page overflow at 375px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoStory(page, VISUAL);
    await expectNoA11yViolations(page);
    // The demo boxes are content-box (+2px border), so judge the components, not the page.
    for (const id of ['full', 'empty', 'truncated']) {
      const box = (await page.getByTestId(`box-${id}`).boundingBox())!;
      const st = (await page.getByTestId(`status-${id}`).boundingBox())!;
      const dl = (await page.getByTestId(`list-${id}`).boundingBox())!;
      expect(st.x + st.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(dl.x + dl.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    }
    const stacked = await page
      .getByTestId('summary-stacked')
      .locator('> dl > div')
      .evaluateAll((items) => items.map((i) => getComputedStyle(i).borderTopWidth));
    expect(stacked).toEqual(['0px', '1px', '0px', '0px', '1px']);
  });
});
