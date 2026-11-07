import { expect, test, type Page } from '@playwright/test';

// Ticket #286. The Introduction page renders live demos INLINE in a Docs page, so Storybook's `.sbdocs`
// stylesheet (border on h2, zebra tables, p/span sizes) can leak into them and show a rendering no consumer of
// the library would ever get. The visual regression only photographs stories tagged `visual`, never Docs/MDX
// pages, so this spec compares the COMPUTED style of the demo elements with the same elements in the
// standard canvas (`viewMode=story`, where `.sbdocs` does not exist). The fix is the `sb-unstyled` wrapper
// (DemoFrame): if someone drops it, or a Storybook upgrade changes the opt-out, this fails.

const PROPS = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'color',
  'backgroundColor',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'borderBottomColor',
  'marginTop',
  'marginBottom',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'fontFamily',
  'letterSpacing',
] as const;

type Snapshot = Record<string, Record<string, string>>;

const INTRO = '/iframe.html?id=introduction--docs&viewMode=docs';
const LIST_REPORT_CANVAS = '/iframe.html?id=floorplans-list-report--smart-filter-bar-showcase&viewMode=story';
const FIELD_CANVAS = '/iframe.html?id=forms-field--overview&viewMode=story';

/** Computed style of the probe elements, resolved inside `scope` (a CSS selector, or the whole document). */
async function snapshotList(page: Page, scope: string | null): Promise<Snapshot> {
  return page.evaluate(
    ({ scope, props }) => {
      const root: ParentNode = scope ? document.querySelector(scope)! : document;
      const pick = (el: Element | null | undefined) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return Object.fromEntries(props.map((p) => [p, (cs as unknown as Record<string, string>)[p]!]));
      };
      const rows = [...root.querySelectorAll('tbody tr')];
      const out: Record<string, Record<string, string> | null> = {
        title: pick(root.querySelector('h2')),
        table: pick(root.querySelector('table')),
        th: pick(root.querySelector('th')),
        td: pick(root.querySelector('tbody td')),
        // zebra: first AND second body row cells must look the same (the leak paints every other row)
        'td-row-1': pick(rows[0]?.querySelector('td')),
        'td-row-2': pick(rows[1]?.querySelector('td')),
      };
      return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Record<string, Record<string, string>>;
    },
    { scope, props: [...PROPS] },
  );
}

async function snapshotFieldMessage(page: Page, scope: string | null, inputName: string): Promise<Record<string, string>> {
  return page.evaluate(
    ({ scope, props, inputName }) => {
      const root: ParentNode = scope ? document.querySelector(scope)! : document;
      const input = [...root.querySelectorAll('input')].find(
        (i) => i.labels?.[0]?.textContent?.trim().startsWith(inputName),
      );
      const id = input?.getAttribute('aria-describedby')?.split(/\s+/)[0];
      const el = id ? document.getElementById(id) : null;
      if (!el) throw new Error(`no described-by element for "${inputName}"`);
      const cs = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, (cs as unknown as Record<string, string>)[p]!]));
    },
    { scope, props: [...PROPS], inputName },
  );
}

test.describe('Introduction demos render like the library (no .sbdocs leak)', () => {
  test('List Report demo: title, table, zebra and badge match the canvas story', async ({ page }) => {
    await page.goto(LIST_REPORT_CANVAS);
    await page.waitForSelector('#storybook-root table');
    const canvas = await snapshotList(page, '#storybook-root');

    await page.goto(INTRO);
    await page.waitForSelector('[data-testid="demo-frame-list-report"] table');
    const intro = await snapshotList(page, '[data-testid="demo-frame-list-report"]');

    // Non-vacuous: every probe exists on both sides.
    const keys = ['title', 'table', 'th', 'td', 'td-row-1', 'td-row-2'];
    for (const key of keys) {
      expect(canvas[key], `canvas probe ${key}`).toBeTruthy();
      expect(intro[key], `intro probe ${key}`).toBeTruthy();
    }
    // The leak symptoms named in the ticket, asserted explicitly with a readable message.
    expect(intro.title!.borderBottomWidth, 'h2 border from .sbdocs').toBe('0px');
    // .sbdocs paints the stripe on the <tr>, not the <td>: compare the rows themselves.
    const rowBg = await page.locator('[data-testid="demo-frame-list-report"] tbody tr').evaluateAll((trs) =>
      trs.slice(0, 4).map((tr) => getComputedStyle(tr).backgroundColor),
    );
    expect(new Set(rowBg).size, `zebra stripe from .sbdocs on <tr>: ${rowBg.join(' | ')}`).toBe(1);
    // Bare text in the frame uses the library font, not the browser serif default.
    const fonts = await page.locator('[data-testid^="demo-frame-"]').evaluateAll((fs) =>
      fs.map((f) => getComputedStyle(f).fontFamily),
    );
    for (const f of fonts) expect(f, 'demo frame font').toMatch(/system-ui|sans-serif/);
    // And full parity of everything else we probe.
    for (const key of keys) {
      expect(intro[key], `${key} computed style`).toEqual(canvas[key]);
    }
  });

  test('StatusBadge in the List Report demo has the same size as the primitive story', async ({ page }) => {
    const BADGE = 'span[class*="rounded-rop"]';
    const dims = (scope: string) =>
      page.locator(`${scope} ${BADGE}`).first().evaluate((el) => {
        const cs = getComputedStyle(el);
        return [cs.fontSize, cs.lineHeight, cs.fontWeight, cs.paddingTop, cs.paddingLeft, cs.borderTopWidth, cs.letterSpacing, cs.height];
      });
    await page.goto('/iframe.html?id=primitives-statusbadge--overview&viewMode=story');
    await page.waitForSelector(`#storybook-root ${BADGE}`);
    const canvas = await dims('#storybook-root');
    expect(canvas[0], 'caption size in the library (non-vacuous)').toBe('12px');

    await page.goto(INTRO);
    await page.waitForSelector(`[data-testid="demo-frame-list-report"] ${BADGE}`);
    // Inside a table cell: the first rounded span of the whole demo is a filter pill, not a badge.
    expect(await dims('[data-testid="demo-frame-list-report"] td')).toEqual(canvas);
  });

  test('Field states demo: the status message has the same size and spacing as in forms-field--overview', async ({ page }) => {
    await page.goto(FIELD_CANVAS);
    await page.waitForSelector('#storybook-root input');
    const canvas = await snapshotFieldMessage(page, '#storybook-root', 'Locked');

    await page.goto(INTRO);
    await page.waitForSelector('[data-testid="demo-frame-field-states"] input');
    const intro = await snapshotFieldMessage(page, '[data-testid="demo-frame-field-states"]', 'Approver');

    expect(canvas.marginTop, 'canvas message margin (non-vacuous)').not.toBe('0px');
    expect(intro.marginTop).toBe(canvas.marginTop);
    expect(intro.fontSize).toBe(canvas.fontSize);
    expect(intro.lineHeight).toBe(canvas.lineHeight);
  });
});
