import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const EPS = 0.5;
const PLAY = 'data-descriptionlist--status-and-summary';
const VISUAL = 'data-descriptionlist--status-and-summary-visual';

const ENTITIES = ['archived with audit', 'archived without audit', 'active, no status', 'detail only'] as const;

const select = (page: Page, entity: string) => page.getByRole('button', { name: entity, exact: true }).click();
const setWidth = (page: Page, width: number) =>
  page.getByTestId('container').evaluate((el, w) => {
    (el as HTMLElement).style.width = `${w}px`;
  }, width);
const box = async (loc: Locator) => (await loc.boundingBox())!;

test.describe('Data/DescriptionList — DescriptionListStatus', () => {
  test('the play function passes', async ({ page }) => {
    await expectPlayToPass(page, PLAY);
  });

  for (const width of [280, 600]) {
    test(`empty row has the same height as a full one (${width}px)`, async ({ page }) => {
      await gotoStory(page, PLAY);
      await setWidth(page, width);
      const status = page.getByTestId('status');
      const heights: number[] = [];
      for (const e of ENTITIES) {
        await select(page, e);
        heights.push((await box(status)).height);
      }
      for (const h of heights) expect(Math.abs(h - heights[0]!)).toBeLessThanOrEqual(EPS);
    });
  }

  test('the <dl> top never moves across all entity combinations, in both directions', async ({ page }) => {
    await gotoStory(page, PLAY);
    const list = page.getByTestId('list');
    const top = (await box(list)).y;
    const order = [...ENTITIES, ...[...ENTITIES].reverse(), ENTITIES[0], ENTITIES[2], ENTITIES[3], ENTITIES[1]];
    for (const e of order) {
      await select(page, e);
      expect(Math.abs((await box(list)).y - top)).toBeLessThanOrEqual(EPS);
    }
  });

  test('long detail on a narrow container stays on one line, height unchanged, tooltip only on real hover', async ({
    page,
  }) => {
    await gotoStory(page, PLAY);
    const status = page.getByTestId('status');
    await select(page, 'active, no status');
    await setWidth(page, 280);
    const emptyHeight = (await box(status)).height;
    await select(page, 'archived with audit');
    expect(Math.abs((await box(status)).height - emptyHeight)).toBeLessThanOrEqual(EPS);
    const detail = status.locator('> span').last();
    const truncated = await detail.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(truncated).toBe(true);
    await expect(detail).toContainText('Archived on 12/10/2026 by Maria Rossi (purchasing office)');
    // not at mount
    await page.waitForTimeout(800);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await detail.hover();
    await expect(page.getByRole('tooltip')).toContainText('Maria Rossi', { timeout: 3000 });
  });

  test('detail that changes (entity switch under the pointer) leaves no orphan tooltip', async ({ page }) => {
    await gotoStory(page, PLAY);
    await select(page, 'archived with audit');
    await setWidth(page, 250);
    await page.getByTestId('status').locator('> span').last().hover();
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 3000 });
    await select(page, 'active, no status');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('badge and detail are vertically centred and the row is no taller than a body line', async ({ page }) => {
    await gotoStory(page, PLAY);
    await select(page, 'archived with audit');
    const status = page.getByTestId('status');
    const [badge, detail, row] = await Promise.all([
      box(status.locator('> span').first()),
      box(status.locator('> span').last()),
      box(status),
    ]);
    expect(Math.abs(badge.y + badge.height / 2 - (detail.y + detail.height / 2))).toBeLessThanOrEqual(1);
    const lineHeight = await status.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect(row.height).toBeLessThanOrEqual(lineHeight + EPS);
  });

  test('order is badge then detail; RTL keeps the logical order', async ({ page }) => {
    await gotoStory(page, PLAY);
    await select(page, 'archived with audit');
    const status = page.getByTestId('status');
    const badge = status.locator('> span').first();
    const detail = status.locator('> span').last();
    const ltr = [await box(badge), await box(detail)];
    expect(ltr[0]!.x).toBeLessThan(ltr[1]!.x);
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    const rtl = [await box(badge), await box(detail)];
    expect(rtl[0]!.x).toBeGreaterThan(rtl[1]!.x);
  });

  test('zoom (larger root font): empty and full rows stay equal and grow with the text', async ({ page }) => {
    await gotoStory(page, PLAY);
    const status = page.getByTestId('status');
    await select(page, 'active, no status');
    const before = (await box(status)).height;
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    const emptyZoom = (await box(status)).height;
    expect(emptyZoom).toBeGreaterThan(before * 1.5);
    await select(page, 'archived with audit');
    expect(Math.abs((await box(status)).height - emptyZoom)).toBeLessThanOrEqual(EPS);
  });

  test('accessibility tree: empty row exposes nothing; filled row reads badge then detail, no live region', async ({
    page,
  }) => {
    await gotoStory(page, PLAY);
    const status = page.getByTestId('status');
    await select(page, 'active, no status');
    expect((await status.ariaSnapshot()).trim()).toBe('');
    await select(page, 'archived with audit');
    const snap = await status.ariaSnapshot();
    expect(snap.indexOf('Archived')).toBeGreaterThanOrEqual(0);
    expect(snap.indexOf('Archived')).toBeLessThan(snap.indexOf('Maria Rossi'));
    await expect(page.locator('[aria-live]:not([aria-live="off"])')).toHaveCount(0);
    await expect(page.getByTestId('status').locator('[role]')).toHaveCount(0);
  });

  test('axe: status present, status empty, summaries', async ({ page }) => {
    await gotoStory(page, PLAY);
    for (const e of ENTITIES) {
      await select(page, e);
      await expectNoA11yViolations(page);
    }
    await gotoStory(page, VISUAL);
    await expectNoA11yViolations(page);
  });

  test('no animation or transition on appear/disappear', async ({ page }) => {
    await gotoStory(page, PLAY);
    const durations = await page
      .getByTestId('status')
      .evaluate((el) =>
        [el, ...Array.from(el.querySelectorAll('*'))].map((n) => getComputedStyle(n).transitionDuration + getComputedStyle(n).animationName),
      );
    for (const d of durations) expect(d).toMatch(/^0s(none)?$/);
  });
});

test.describe('Data/DescriptionList — DescriptionListStatus edge cases', () => {
  const EDGES = 'data-descriptionlist--status-edge-cases';

  test('a badge with an icon keeps the row at one body line, same as the row with no badge', async ({ page }) => {
    await gotoStory(page, EDGES);
    const plain = (await page.getByTestId('row-plain').boundingBox())!;
    const icon = (await page.getByTestId('row-icon').boundingBox())!;
    expect(Math.abs(icon.height - plain.height)).toBeLessThanOrEqual(EPS);
  });

  test('a status node that renders nothing leaves no gap before the detail', async ({ page }) => {
    await gotoStory(page, EDGES);
    const left = (row: string) =>
      page.getByTestId(row).evaluate((el) => el.querySelector(':scope > :last-child')!.getBoundingClientRect().left - el.getBoundingClientRect().left);
    expect(Math.abs((await left('row-null')) - (await left('row-plain')))).toBeLessThanOrEqual(EPS);
  });

  test('a long badge shrinks and the detail keeps a visible, reachable width', async ({ page }) => {
    await gotoStory(page, EDGES);
    const detail = page.getByTestId('row-long').locator('> :last-child');
    expect((await detail.boundingBox())!.width).toBeGreaterThanOrEqual(90);
    const row = (await page.getByTestId('row-long').boundingBox())!;
    expect(Math.abs(row.height - (await page.getByTestId('row-plain').boundingBox())!.height)).toBeLessThanOrEqual(EPS);
  });

  test('className with the important modifier drops the separator (border and padding) of a summary item', async ({ page }) => {
    await gotoStory(page, EDGES);
    const style = await page
      .getByTestId('override-list')
      .locator('> div')
      .last()
      .evaluate((el) => [getComputedStyle(el).borderTopWidth, getComputedStyle(el).paddingTop]);
    expect(style).toEqual(['0px', '0px']);
  });
});

test.describe('Data/DescriptionList — summary rows', () => {
  const dds = (page: Page, testid: string) => page.getByTestId(testid).locator('dd');

  test('value column of summaries = column of normal rows (inline) and = the dt (stacked)', async ({ page }) => {
    await gotoStory(page, VISUAL);
    const inline = await dds(page, 'summary-inline').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    for (const l of inline) expect(Math.abs(l - inline[0]!)).toBeLessThanOrEqual(1);
    const stacked = await page.getByTestId('summary-stacked').locator('> dl > div').evaluateAll((items) =>
      items.map((i) => [i.querySelector('dt')!.getBoundingClientRect().left, i.querySelector('dd')!.getBoundingClientRect().left]),
    );
    for (const [dt, dd] of stacked) expect(Math.abs(dd! - dt!)).toBeLessThanOrEqual(1);
  });

  test('one separator above the first item of each run of summaries (two runs), none elsewhere', async ({ page }) => {
    await gotoStory(page, VISUAL);
    const widths = await page
      .getByTestId('summary-inline')
      .locator('> dl > div')
      .evaluateAll((items) => items.map((i) => getComputedStyle(i).borderTopWidth));
    // Taxable amount, VAT (run 1 start), Total, Paid, Balance (run 2 start)
    expect(widths).toEqual(['0px', '1px', '0px', '0px', '1px']);
  });

  test('no separator when the list starts with summaries or has only summaries', async ({ page }) => {
    await gotoStory(page, VISUAL);
    const result = await page.getByTestId('summary-inline').locator('> dl').evaluate((dl) => {
      const items = Array.from(dl.children) as HTMLElement[];
      const border = () => Array.from(dl.children).map((i) => getComputedStyle(i).borderTopWidth);
      // only summaries
      const normals = items.filter((i) => !i.hasAttribute('data-rop-summary'));
      normals.forEach((n) => n.remove());
      const onlySummaries = border();
      // summary first, then a normal one, then summaries again: [VAT, Taxable amount, Total, Paid, Balance]
      dl.replaceChildren(items[1]!, items[0]!, items[2]!, items[3]!, items[4]!);
      const summaryFirst = border();
      return { onlySummaries, summaryFirst };
    });
    expect(result.onlySummaries).toEqual(['0px', '0px', '0px']);
    // no separator at the top; one above the summary that follows a normal item; none for the
    // summary that follows another summary; one above the last run
    expect(result.summaryFirst).toEqual(['0px', '0px', '1px', '0px', '1px']);
  });

  test('emphasis: semibold and tabular figures', async ({ page }) => {
    await gotoStory(page, VISUAL);
    const styles = await page
      .getByTestId('summary-inline')
      .locator('> dl > div')
      .evaluateAll((items) =>
        items.map((i) => {
          const s = getComputedStyle(i.querySelector('dd')!);
          return [s.fontWeight, s.fontVariantNumeric];
        }),
      );
    expect(styles[0]![0]).toBe('400');
    expect(styles[1]![0]).toBe('600');
    expect(styles[1]![1]).toContain('tabular-nums');
  });
});
