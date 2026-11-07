import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const OVERVIEW = 'primitives-statusbadge--overview';
const EPS = 1;

test.describe('Primitives/StatusBadge', () => {
  test('the visual matrix renders every tone and passes axe', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    for (const tone of ['neutral', 'info', 'success', 'warning', 'error']) {
      await expect(page.getByTestId(`tone-${tone}`)).toBeVisible();
      await expect(page.getByTestId(`tone-icon-${tone}`)).toBeVisible();
    }
    await expectNoA11yViolations(page);
  });

  test('the Playground and NarrowLongText play functions pass', async ({ page }) => {
    await expectPlayToPass(page, 'primitives-statusbadge--playground');
    await expectPlayToPass(page, 'primitives-statusbadge--narrow-long-text');
  });

  test('the tone changes the colours (from tokens), and every tone has a visible border', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const styles = await page.evaluate(() =>
      ['neutral', 'info', 'success', 'warning', 'error'].map((t) => {
        const cs = getComputedStyle(document.querySelector(`[data-testid="tone-${t}"]`) as Element);
        return { bg: cs.backgroundColor, border: cs.outlineColor, width: cs.outlineWidth, radius: cs.borderTopLeftRadius };
      }),
    );
    expect(new Set(styles.map((s) => s.bg)).size).toBe(5);
    expect(new Set(styles.map((s) => s.border)).size).toBe(5);
    for (const s of styles) {
      expect(s.width).toBe('1px');
      expect(s.radius).toBe('4px');
    }
  });

  test('the root has no padding or border: its max-width is the real outer width', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const m = await page.getByTestId('tone-info').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { sizing: cs.boxSizing, pad: cs.paddingLeft + cs.paddingRight, border: cs.borderLeftWidth + cs.borderRightWidth };
    });
    expect(m).toEqual({ sizing: 'content-box', pad: '0px0px', border: '0px0px' });
  });

  test('in a body text line the badge is not taller than the line and does not lengthen it', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const m = await page.evaluate(() => {
      const h = (id: string) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement).getBoundingClientRect().height;
      const token = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--text-rop-body--line-height').trim(),
      ) * parseFloat(getComputedStyle(document.documentElement).fontSize);
      return { badge: h('line-badge'), withBadge: h('line-with-badge'), plain: h('line-plain'), token };
    });
    expect(m.token).toBe(20);
    expect(m.badge).toBeLessThanOrEqual(m.token + EPS);
    expect(Math.abs(m.withBadge - m.plain)).toBeLessThanOrEqual(EPS);
  });

  test('in a 120px container a long text is cut with an ellipsis, on one line, without overflow', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const narrow = page.getByTestId('narrow');
    await expectNoHorizontalOverflow(narrow);
    const m = await page.getByTestId('narrow-badge').evaluate((el) => {
      const label = el.lastElementChild as HTMLElement;
      const cs = getComputedStyle(label);
      return {
        badge: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
        ellipsis: cs.textOverflow,
        nowrap: cs.whiteSpace,
        clipped: label.scrollWidth > label.clientWidth,
        text: el.textContent,
        maxWidth: getComputedStyle(el).maxWidth,
        minWidth: getComputedStyle(el).minWidth,
      };
    });
    expect(m.badge).toBeLessThanOrEqual(120 + EPS);
    expect(m.height).toBeLessThanOrEqual(20 + EPS);
    expect(m.ellipsis).toBe('ellipsis');
    expect(m.nowrap).toBe('nowrap');
    expect(m.clipped).toBe(true);
    expect(m.text).toContain('Archived, awaiting approval from the department manager');
    expect(m.maxWidth).toBe('100%');
    expect(m.minWidth).toBe('0px');
  });

  test('the icon is aria-hidden, 12px (xs) and vertically centred with the text', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const badge = page.getByTestId('tone-icon-success');
    const m = await badge.evaluate((el) => {
      const svg = el.querySelector('svg') as SVGElement;
      const label = el.lastElementChild as HTMLElement;
      const r = svg.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(label);
      const t = range.getBoundingClientRect();
      return {
        w: r.width,
        h: r.height,
        hidden: svg.closest('[aria-hidden="true"]') !== null,
        iconCentre: r.top + r.height / 2,
        textCentre: t.top + t.height / 2,
      };
    });
    expect(m.w).toBe(12);
    expect(m.h).toBe(12);
    expect(m.hidden).toBe(true);
    expect(Math.abs(m.iconCentre - m.textCentre)).toBeLessThanOrEqual(EPS);
  });

  test('inside a fixed-layout table cell the badge does not widen the column', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const result = await page.evaluate(() => {
      const root = document.querySelector('#storybook-root') as HTMLElement;
      const table = document.createElement('table');
      table.style.cssText = 'table-layout: fixed; width: 160px; border-collapse: collapse';
      table.innerHTML = '<tr><td id="c1" style="width:80px;padding:0;overflow:hidden">x</td><td id="c2"></td></tr>';
      root.appendChild(table);
      const src = document.querySelector('[data-testid="narrow-badge"]') as HTMLElement;
      const clone = src.cloneNode(true) as HTMLElement;
      document.getElementById('c2')!.appendChild(clone);
      const before = document.getElementById('c1')!.getBoundingClientRect().width;
      const cell = document.getElementById('c2')!.getBoundingClientRect().width;
      const badge = clone.getBoundingClientRect().width;
      table.remove();
      return { before, cell, badge };
    });
    expect(result.before).toBe(80);
    expect(result.badge).toBeLessThanOrEqual(result.cell + EPS);
  });

  test('as a DescriptionList value (inline and stacked) it aligns like a text value', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    for (const layout of ['inline', 'stacked']) {
      const m = await page.getByTestId(`dl-${layout}`).evaluate((dl, l) => {
        const badge = dl.querySelector(`[data-testid="dl-badge-${l}"]`) as HTMLElement;
        const dds = Array.from(dl.querySelectorAll('dd'));
        const dts = Array.from(dl.querySelectorAll('dt'));
        const text = dds[0] as HTMLElement;
        const statusDd = dds[1] as HTMLElement;
        const centre = (r: DOMRect) => r.top + r.height / 2;
        return {
          // the badge's row is not taller than the text row
          rowDelta: statusDd.getBoundingClientRect().height - text.getBoundingClientRect().height,
          left: Math.abs(badge.getBoundingClientRect().left - text.getBoundingClientRect().left),
          labelCentre: Math.abs(centre(badge.getBoundingClientRect()) - centre(dts[1]!.getBoundingClientRect())),
          inline: l === 'inline',
        };
      }, layout);
      expect(m.rowDelta).toBeLessThanOrEqual(EPS);
      expect(m.left).toBeLessThanOrEqual(EPS);
      if (m.inline) expect(m.labelCentre).toBeLessThanOrEqual(EPS + 1);
    }
  });

  test('forced-colors: the badge keeps a visible contour', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoStory(page, OVERVIEW);
    for (const tone of ['neutral', 'error']) {
      const contour = await page.getByTestId(`tone-${tone}`).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset };
      });
      expect(contour).toEqual({ style: 'solid', width: '1px', offset: '-1px' });
    }
  });
});
