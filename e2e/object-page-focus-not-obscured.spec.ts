import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// WCAG 2.4.12 Focus Not Obscured (Enhanced), #497: a control that gets the keyboard focus inside the
// Object Page scroller is never even partly under the sticky Anchor Bar, nor under the save bar (which
// sits below the scroller). Native focus scrolling ignores sticky bars unless the page declares them.
const STORY = 'floorplans-object-page-layout--long-form';
const SCROLLER = '[data-object-page-scroller]';

const VIEWPORTS = [
  ['desktop', { width: 1280, height: 800 }],
  ['phone', { width: 390, height: 844 }],
] as const;

// Every control of the story, in Tab order: the header action, the fields of each section (the nested
// "Bank details" section included), and the save bar's actions.
const HEADER_ACTION = 'Edit';
const FIELDS = [
  'Order number',
  'Order date',
  'Requested delivery',
  'Requisition reference',
  'Cost center',
  'Project code',
  'Currency',
  'Payment terms',
  'Buyer',
  'Approver',
  'Supplier name',
  'VAT number',
  'Street',
  'City',
  'Postal code',
  'Country',
  'IBAN',
  'BIC',
  'Internal notes',
  'Notes for the supplier',
];

interface Probe {
  /** Accessible name of the focused control (its label or its text). */
  name: string;
  /** Whether the focus is inside the scroller and outside the Anchor Bar (the case under test). */
  inContent: boolean;
  /** Whether the focus is in the save bar. */
  inFooter: boolean;
  top: number;
  bottom: number;
  /** How far the focus indicator reaches outside the box (outline width + offset; 0 without one). */
  ring: number;
  /** Bottom edge of the Anchor Bar. */
  barBottom: number;
  /** Bottom edge of the scroller's visible area (the save bar starts there). */
  scrollerBottom: number;
  /** Top edge of the save bar (null when the page has none). */
  footerTop: number | null;
}

function probe(page: Page): Promise<Probe> {
  return page.evaluate((selector) => {
    const el = document.activeElement as HTMLElement;
    const scroller = document.querySelector(selector) as HTMLElement;
    const bar = scroller.querySelector('[data-object-page-anchor-bar]') as HTMLElement;
    const footer = document.querySelector<HTMLElement>('[data-object-page-footer]');
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const ring = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth) + (parseFloat(cs.outlineOffset) || 0);
    const labelled = el.getAttribute('aria-labelledby');
    const name = (labelled ? document.getElementById(labelled)?.textContent : el.textContent) ?? '';
    return {
      name: name.trim(),
      inContent: scroller.contains(el) && el !== scroller && !bar.contains(el),
      inFooter: !!footer?.contains(el),
      top: box.top,
      bottom: box.bottom,
      ring,
      barBottom: bar.getBoundingClientRect().bottom,
      scrollerBottom: scroller.getBoundingClientRect().bottom,
      footerTop: footer ? footer.getBoundingClientRect().top : null,
    };
  }, SCROLLER);
}

/** The focused control, and its focus indicator, sit entirely between the Anchor Bar and the save bar. */
function expectClear(p: Probe, where: string) {
  expect(p.inContent, `${where}: the focus is in the content`).toBe(true);
  expect(p.top, `${where}: "${p.name}" is below the Anchor Bar`).toBeGreaterThanOrEqual(p.barBottom - 0.5);
  expect(p.top - p.ring, `${where}: the focus indicator of "${p.name}" is below the Anchor Bar`).toBeGreaterThanOrEqual(
    p.barBottom - 0.5,
  );
  expect(p.bottom + p.ring, `${where}: "${p.name}" is above the end of the scroller`).toBeLessThanOrEqual(
    p.scrollerBottom + 0.5,
  );
  if (p.footerTop !== null) {
    expect(p.bottom + p.ring, `${where}: "${p.name}" is above the save bar`).toBeLessThanOrEqual(p.footerTop + 0.5);
  }
}

/** Positions of the field labels, relative to the viewport. */
const labelTops = (page: Page) =>
  page.locator(SCROLLER).evaluate((el) =>
    Array.from(el.querySelectorAll('label')).map((label) => Math.round(label.getBoundingClientRect().top * 100) / 100),
  );

for (const [name, viewport] of VIEWPORTS) {
  test.describe(`Object Page: the focus is never under the sticky bars (${name} ${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await gotoStory(page, STORY);
      await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Save actions' })).toBeVisible();
      // The story's play tabs through the fields: start every test from the top, with no focus.
      await page.locator(SCROLLER).evaluate((el) => {
        (document.activeElement as HTMLElement | null)?.blur();
        el.scrollTop = 0;
      });
    });

    test('Tab from the header action to the save bar: every control is clear of both bars @engines', async ({ page }) => {
      await page.getByRole('button', { name: HEADER_ACTION }).focus();
      for (const [i, field] of FIELDS.entries()) {
        await page.keyboard.press('Tab');
        const p = await probe(page);
        expect(p.name, `Tab ${i + 1}`).toBe(field);
        expectClear(p, `Tab ${i + 1}`);
      }
      await page.keyboard.press('Tab');
      expect((await probe(page)).inFooter, 'the last Tab reaches the save bar').toBe(true);
    });

    test('Shift+Tab from the save bar to the header action: every control is clear of both bars @engines', async ({ page }) => {
      await page.getByRole('button', { name: 'Cancel' }).focus();
      for (const [i, field] of [...FIELDS].reverse().entries()) {
        await page.keyboard.press('Shift+Tab');
        const p = await probe(page);
        expect(p.name, `Shift+Tab ${i + 1}`).toBe(field);
        expectClear(p, `Shift+Tab ${i + 1}`);
      }
      await page.keyboard.press('Shift+Tab');
      const header = await probe(page);
      expect(header.name).toBe(HEADER_ACTION);
      expectClear(header, 'header action');
    });

    // The field reached next sits partly under the bar already: inside the scrollport, so only the declared
    // room makes the browser scroll it. Several overlaps, with the field before it holding the focus (focused
    // first: a Field brings itself into view when it gets the focus outside the window).
    for (const overlap of [1, 10, 30]) {
      test(`Tab onto a field ${overlap}px under the Anchor Bar brings it clear of the bar @engines`, async ({ page }) => {
        await page.getByRole('textbox', { name: 'Project code' }).focus();
        const target = page.getByRole('textbox', { name: 'Currency' });
        const under = () =>
          target.evaluate((el) => {
            const bar = el.closest('[data-object-page-scroller]')!.querySelector('[data-object-page-anchor-bar]') as HTMLElement;
            return bar.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
          });
        await target.evaluate((el, px) => {
          const scroller = el.closest('[data-object-page-scroller]') as HTMLElement;
          const bar = scroller.querySelector('[data-object-page-anchor-bar]') as HTMLElement;
          scroller.scrollTop += el.getBoundingClientRect().top - bar.getBoundingClientRect().bottom + px;
        }, overlap);
        // Two frames later the field is still where it was put: nothing else scrolled.
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        expect(await under()).toBeCloseTo(overlap, 0);
        await page.keyboard.press('Tab');
        const p = await probe(page);
        expect(p.name).toBe('Currency');
        expectClear(p, `overlap ${overlap}px`);
      });
    }

    test('hiding and showing the save bar moves no visible field @engines', async ({ page }) => {
      const scroller = page.locator(SCROLLER);
      await scroller.evaluate((el) => (el.scrollTop = 300));
      await page.getByRole('textbox', { name: 'Payment terms' }).focus();
      const before = await labelTops(page);
      // The header (and its "Edit") has scrolled away: clicked from script, not with a pointer that would scroll to it.
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('region', { name: 'Save actions' })).toBeHidden();
      expect(await labelTops(page)).toEqual(before);
      await page.getByRole('button', { name: HEADER_ACTION }).evaluate((el) => (el as HTMLElement).click());
      await expect(page.getByRole('region', { name: 'Save actions' })).toBeVisible();
      expect(await labelTops(page)).toEqual(before);
    });

    test('the story play function passes', async ({ page }) => {
      await expectPlayToPass(page, STORY);
    });
  });
}

// The Pro showcase editor with the RebaseNotice visible (it sits right above the scroller and takes its room
// from the scroller's top): walking the whole editor with Shift+Tab, then Tab, never leaves a control under the
// Anchor Bar or past the scroller's bottom edge (the save bar below it is shown: the form is dirty).
type ShowcaseWindow = {
  __ropShowcaseStore?: {
    snapshot: () => { id: string; number: string; lineItems: unknown[] }[];
    updateFromServer: (id: string, change: (r: object) => object, delayMs?: number) => Promise<unknown>;
  };
};
const PRO_FIXTURE =
  '/iframe.html?id=pro-showcase-invoices-with-change-summary--manual&viewMode=story&args=' +
  encodeURIComponent('listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:0');

for (const [name, viewport] of VIEWPORTS) {
  test(`Pro showcase, RebaseNotice visible (${name}): Shift+Tab and Tab through the editor keep every control clear of both bars @engines`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(PRO_FIXTURE);
    // The first stored record with three lines or more: a long editor.
    const record = await page.evaluate(() => {
      const rows = (window as unknown as ShowcaseWindow).__ropShowcaseStore!.snapshot();
      return rows.find((r) => r.lineItems.length >= 3)!.number;
    });
    await page.getByRole('link', { name: record, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(record) })).toBeVisible();
    await page.getByLabel('Due date', { exact: true }).fill('2026-03-05');
    // Another user changes the same date: a conflict, the notice appears above the scroller.
    await page.evaluate((number) => {
      const store = (window as unknown as ShowcaseWindow).__ropShowcaseStore!;
      const id = store.snapshot().find((r) => r.number === number)!.id;
      void store.updateFromServer(id, (r) => ({ ...r, dueDate: '2026-03-12' }));
    }, record);
    await expect(page.getByRole('list', { name: 'Conflicts' }).getByRole('listitem')).toHaveCount(1);
    await expect(page.locator('.rop-pro-rebase-notice')).toBeVisible();

    await page.getByRole('region', { name: 'Save actions' }).getByRole('button', { name: 'Save' }).focus();
    const seen: string[] = [];
    // Up to the first control above the scroller's content (the header actions are in it; the notice is not).
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Shift+Tab');
      const p = await probe(page);
      if (!p.inContent) break;
      seen.push(p.name);
      expectClear(p, `Shift+Tab ${i + 1}`);
    }
    expect(seen.length, 'controls reached in the scroller').toBeGreaterThanOrEqual(8);
    // And back down to the save bar.
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const p = await probe(page);
      if (p.inFooter) break;
      if (!p.inContent) continue;
      expectClear(p, `Tab ${i + 1}`);
    }
    expect((await probe(page)).inFooter, 'Tab reaches the save bar').toBe(true);
  });
}

type KeyboardWindow = { __setKeyboard: (px: number) => void };

// The virtual keyboard, with the visual viewport replaced by a controllable stand-in (the technique of
// e2e/field.spec.ts and e2e/object-page-layout.spec.ts: chromium only, like every keyboard stand-in in the
// repo). With the keyboard open, each field reached with Tab or Shift+Tab is below the Anchor Bar and above the
// keyboard, and only the inner scroller moves.
test.describe('Object Page: the focus is never under the Anchor Bar nor the virtual keyboard (phone 390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const KEYBOARD = 380;

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const target = new EventTarget();
      let keyboard = 0;
      const vv = Object.defineProperties(target, {
        offsetTop: { value: 0 },
        offsetLeft: { value: 0 },
        pageTop: { value: 0 },
        pageLeft: { value: 0 },
        scale: { value: 1 },
        height: { get: () => window.innerHeight - keyboard },
        width: { get: () => window.innerWidth },
      });
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
      (window as unknown as KeyboardWindow).__setKeyboard = (px) => {
        keyboard = px;
        target.dispatchEvent(new Event('resize'));
      };
    });
    await gotoStory(page, STORY);
    await page.locator(SCROLLER).evaluate((el) => {
      (document.activeElement as HTMLElement | null)?.blur();
      el.scrollTop = 0;
    });
  });

  test('Tab down and Shift+Tab back up with the keyboard open', async ({ page }) => {
    const visibleBottom = 844 - KEYBOARD;
    await page.getByRole('textbox', { name: 'Supplier name' }).focus();
    await page.evaluate((px) => (window as unknown as KeyboardWindow).__setKeyboard(px), KEYBOARD);
    const check = async (where: string) => {
      const p = await probe(page);
      expect(p.inContent, `${where}: the focus is in the content`).toBe(true);
      expect(p.top - p.ring, `${where}: "${p.name}" and its focus indicator are below the Anchor Bar`).toBeGreaterThanOrEqual(
        p.barBottom - 0.5,
      );
      expect(p.bottom + p.ring, `${where}: "${p.name}" is above the keyboard`).toBeLessThanOrEqual(visibleBottom + 0.5);
      expect(await page.evaluate(() => window.scrollY), `${where}: the document did not scroll`).toBe(0);
      return p.name;
    };
    await expect.poll(async () => (await probe(page)).bottom).toBeLessThanOrEqual(visibleBottom);
    const start = FIELDS.indexOf('Supplier name');
    for (const field of FIELDS.slice(start + 1)) {
      await page.keyboard.press('Tab');
      // The Field brings itself above the keyboard on its own visual-viewport work: wait for it, then measure.
      await expect.poll(async () => (await probe(page)).bottom).toBeLessThanOrEqual(visibleBottom);
      expect(await check(`Tab to ${field}`)).toBe(field);
    }
    for (const field of [...FIELDS.slice(0, -1)].reverse()) {
      await page.keyboard.press('Shift+Tab');
      await expect.poll(async () => (await probe(page)).bottom).toBeLessThanOrEqual(visibleBottom);
      expect(await check(`Shift+Tab to ${field}`)).toBe(field);
    }
  });
});
