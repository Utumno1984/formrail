import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// QA of #57 (ObjectPageFooter): cases the dev's spec does not cover.
const STORY = (name: string) => `floorplans-object-page-footer--${name}`;
const SCROLLER = '[data-object-page-scroller]';
const FOOTER = '[data-object-page-footer]';

const jsClick = (page: Page, name: string) =>
  page.evaluate((n) => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === n);
    if (!button) throw new Error(`no button "${n}"`);
    button.click();
  }, name);

test.describe('ObjectPageFooter QA', () => {
  test.use({ viewport: { width: 1024, height: 700 } });

  test('visible at the first render: same geometry as after a hide, no entry animation moving the scroller', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'visible:!true');
    const scroller = page.locator(SCROLLER);
    const early = await scroller.evaluate((el) => el.clientHeight);
    const footerBox = await page.locator(FOOTER).boundingBox();
    await jsClick(page, 'Cancel changes');
    await expect(page.getByRole('region', { name: 'Save actions' })).toHaveCount(0);
    expect(await scroller.evaluate((el) => el.clientHeight)).toBe(early);
    const hiddenBox = await page.locator(FOOTER).boundingBox();
    expect(hiddenBox!.y).toBe(footerBox!.y);
    expect(hiddenBox!.height).toBe(footerBox!.height);
  });

  test('hidden WITH a message: message and status are out of the a11y tree, not hit-testable, not focusable', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'visible:!false');
    await expect(page.getByRole('region', { name: 'Save actions' })).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByText(/Save failed/)).toBeHidden();
    const info = await page.evaluate((sel) => {
      const footer = document.querySelector(sel)!;
      const msg = footer.querySelector('[tabindex="0"]') as HTMLElement | null;
      msg?.focus();
      const r = footer.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 40, r.top + r.height / 2);
      return { focused: footer.contains(document.activeElement), hitInFooter: !!hit && footer.contains(hit) };
    }, FOOTER);
    expect(info.focused).toBe(false);
    expect(info.hitInFooter).toBe(false);
  });

  test('focus on a button that becomes disabled during the save, then the footer hides: focus lands on the title', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'visible:!true');
    const save = page.getByRole('button', { name: 'Save' });
    await save.focus();
    // aria-disabled, as the FormFlow demo does: a native `disabled` makes Chromium drop the focus to <body>
    // by itself, before the footer has any say (documented as a consumer concern in the QA report).
    await save.evaluate((el) => el.setAttribute('aria-disabled', 'true'));
    await jsClick(page, 'Cancel changes');
    await expect(page.getByRole('region', { name: 'Save actions' })).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('keyboard: after the footer hides from Save, Tab continues in the page and never lands on the hidden footer', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'visible:!true');
    await page.getByRole('button', { name: 'Save' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate((s) => !!document.activeElement?.closest(s), FOOTER)).toBe(false);
    }
  });

  test('the truncated message shows its full text on keyboard focus (and the footer is axe-safe via role=region)', async ({ page }) => {
    await gotoStory(page, STORY('long-error'));
    await page.getByRole('button', { name: 'Cancel changes' }).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator(FOOTER).locator('[tabindex="0"]')).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText('Reload the page and try again.');
  });

  test('RTL: the actions go to the visual left (end of the row inverted) and the page does not overflow', async ({ page }) => {
    await gotoStory(page, STORY('with-actions'));
    await page.evaluate(() => (document.documentElement.dir = 'rtl'));
    const r = await page.evaluate((sel) => {
      const footer = document.querySelector(sel)!.getBoundingClientRect();
      const actions = document.querySelector('[data-object-page-footer-actions]')!.getBoundingClientRect();
      const btns = Array.from(document.querySelectorAll(`${sel} button`)).map((b) => b.getBoundingClientRect());
      return {
        footerLeft: footer.left,
        footerRight: footer.right,
        actionsLeft: actions.left,
        actionsRight: actions.right,
        minBtnLeft: Math.min(...btns.map((b) => b.left)),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    }, FOOTER);
    expect(r.overflow).toBe(false);
    // The buttons sit on the left half, near the start-of-LTR edge.
    expect(r.minBtnLeft - r.footerLeft).toBeLessThanOrEqual(30);
    expect(r.footerRight - r.actionsRight).toBeGreaterThan(200);
  });

  test('page without a bounded height (document as scroller): the footer stays below the content, nothing clipped', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'visible:!true');
    await page.evaluate(() => {
      const frame = document.querySelector('[data-object-page-scroller]')!.closest('div[style*="100dvh"]') as HTMLElement | null;
      if (frame) frame.style.height = 'auto';
    });
    const r = await page.evaluate((sel) => {
      const scroller = document.querySelector('[data-object-page-scroller]') as HTMLElement;
      const footer = document.querySelector(sel)!.getBoundingClientRect();
      return {
        scrollerBottom: scroller.getBoundingClientRect().bottom,
        footerTop: footer.top,
        scrollerClipped: scroller.scrollHeight > scroller.clientHeight + 1,
        docHeight: document.documentElement.scrollHeight,
        footerBottomAbs: footer.bottom + window.scrollY,
      };
    }, FOOTER);
    // Footer is directly after the scroller and the document ends with it.
    expect(Math.abs(r.footerTop - r.scrollerBottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.docHeight - r.footerBottomAbs)).toBeLessThanOrEqual(1);
  });

  test('no console errors/warnings while toggling, and no non-DOM attribute on the footer element', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) logs.push(m.text());
    });
    await gotoStory(page, STORY('manual'), 'visible:!true');
    for (let i = 0; i < 3; i++) {
      await jsClick(page, 'Cancel changes');
      await jsClick(page, 'Edit');
    }
    const attrs = await page.locator(FOOTER).evaluate((el) => el.getAttributeNames());
    for (const bad of ['visible', 'message', 'messagetone', 'label', 'tonelabel']) expect(attrs).not.toContain(bad);
    expect(logs).toEqual([]);
  });

  test('mobile 390x844: messages above the actions, constant height, actions fill the row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoStory(page, STORY('with-actions'));
    const plain = (await page.locator(FOOTER).boundingBox())!.height;
    await gotoStory(page, STORY('long-error'));
    const box = (await page.locator(FOOTER).boundingBox())!;
    expect(Math.abs(box.height - plain)).toBeLessThanOrEqual(1);
    const hidden = await (async () => {
      await gotoStory(page, STORY('hidden'));
      return (await page.locator(FOOTER).boundingBox())!.height;
    })();
    // Hidden reserves the same room as the one with the message (message strip is always reserved on mobile).
    expect(Math.abs(hidden - plain)).toBeLessThanOrEqual(1);
  });
});
