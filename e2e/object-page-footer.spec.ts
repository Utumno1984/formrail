import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `floorplans-object-page-footer--${name}`;
const SCROLLER = '[data-object-page-scroller]';
const FOOTER = '[data-object-page-footer]';

type KeyboardWindow = { __setKeyboard: (px: number) => void };

/** JS `click()` does not move the focus: the way to toggle the footer without disturbing what has it. */
const jsClick = (page: Page, name: string) =>
  page.evaluate((n) => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === n);
    if (!button) throw new Error(`no button "${n}"`);
    button.click();
  }, name);

const activeInFooter = (page: Page) => page.evaluate((sel) => !!document.activeElement?.closest(sel), FOOTER);

test.describe('Floorplans/Object Page/Footer', () => {
  test.use({ viewport: { width: 1024, height: 700 } });

  test('the play function passes (reserved space, Salva, focus on the header title)', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'));
  });

  test('the form flow keeps the field error on the field and the focus on the invalid field', async ({ page }) => {
    await expectPlayToPass(page, STORY('form-flow'));
  });

  test('sits in the bottom slot, outside the scroller, below it', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'visible:!true');
    const geometry = await page.evaluate(
      ([scrollerSel, footerSel]) => {
        const scroller = document.querySelector(scrollerSel!)!;
        const footer = document.querySelector(footerSel!)!;
        return {
          inside: scroller.contains(footer),
          scrollerBottom: scroller.getBoundingClientRect().bottom,
          footerTop: footer.getBoundingClientRect().top,
          footerBottom: footer.getBoundingClientRect().bottom,
          innerHeight: window.innerHeight,
        };
      },
      [SCROLLER, FOOTER],
    );
    expect(geometry.inside).toBe(false);
    expect(Math.abs(geometry.footerTop - geometry.scrollerBottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.footerBottom - geometry.innerHeight)).toBeLessThanOrEqual(1);
  });

  test('showing and hiding it (also in quick succession) moves nothing: scroller height, scrollTop, focused field', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const scroller = page.locator(SCROLLER);
    const field = page.getByRole('textbox', { name: 'Note interne' });
    await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await field.focus();
    const measure = async () => ({
      clientHeight: await scroller.evaluate((el) => el.clientHeight),
      scrollTop: await scroller.evaluate((el) => el.scrollTop),
      top: await field.evaluate((el) => el.getBoundingClientRect().top),
      footerHeight: await page.locator(FOOTER).evaluate((el) => el.getBoundingClientRect().height),
    });
    const hidden = await measure();
    // The declared height of the actions row (3.5rem = 56px at the default font size) plus the 1px border,
    // there from the first render although hidden.
    expect(hidden.footerHeight).toBe(57);

    await jsClick(page, 'Modifica');
    await expect(page.getByRole('region', { name: 'Save actions' })).toBeVisible();
    const shown = await measure();
    for (const key of ['clientHeight', 'scrollTop', 'top', 'footerHeight'] as const) {
      expect(Math.abs(shown[key] - hidden[key]), key).toBeLessThanOrEqual(1);
    }
    await expect(field).toBeFocused();

    for (let i = 0; i < 4; i++) {
      await jsClick(page, 'Annulla modifiche');
      await jsClick(page, 'Modifica');
    }
    await jsClick(page, 'Annulla modifiche');
    const end = await measure();
    for (const key of ['clientHeight', 'scrollTop', 'top', 'footerHeight'] as const) {
      expect(Math.abs(end[key] - hidden[key]), key).toBeLessThanOrEqual(1);
    }
    await expect(field).toBeFocused();
  });

  test('hidden: not reachable with Tab, not clickable, out of the accessibility tree', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await expect(page.getByRole('region', { name: 'Save actions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salva' })).toHaveCount(0);
    expect(await page.locator(FOOTER).evaluate((el) => el.hasAttribute('inert'))).toBe(true);

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await activeInFooter(page)).toBe(false);
    }
    // Nothing of the footer sits under the point where "Salva" will be.
    const hit = await page.evaluate((sel) => {
      const footer = document.querySelector(sel)!.getBoundingClientRect();
      const el = document.elementFromPoint(footer.right - 24 - 16, footer.top + footer.height / 2);
      return !!el?.closest('button');
    }, FOOTER);
    expect(hit).toBe(false);
  });

  test('visible: a region with the actions, reachable with Tab, aligned to the end', async ({ page }) => {
    await gotoStory(page, STORY('with-actions'));
    const region = page.getByRole('region', { name: 'Save actions' });
    await expect(region).toBeVisible();
    const save = region.getByRole('button', { name: 'Salva' });
    await expect(save).toBeVisible();
    const box = await region.boundingBox();
    const cancel = await region.getByRole('button', { name: 'Annulla modifiche' }).boundingBox();
    expect(Math.abs(box!.x + box!.width - 24 - (cancel!.x + cancel!.width))).toBeLessThanOrEqual(1);
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await save.evaluate((el) => el === document.activeElement);
    }
    expect(reached).toBe(true);
  });

  test('the focus never ends on <body> when the footer hides with the focus on Salva (click and keyboard)', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'visible:!true');
    const save = page.getByRole('button', { name: 'Salva' });
    await save.click();
    await expect(page.getByRole('region', { name: 'Save actions' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

    await jsClick(page, 'Modifica');
    await page.getByRole('button', { name: 'Annulla modifiche' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('a long message stays on one line, keeps the height and shows the full text on hover', async ({ page }) => {
    await gotoStory(page, STORY('with-actions'));
    const plain = await page.locator(FOOTER).boundingBox();
    await gotoStory(page, STORY('long-error'));
    const footer = page.locator(FOOTER);
    expect((await footer.boundingBox())!.height).toBe(plain!.height);
    const message = footer.locator('[data-object-page-footer-message]');
    const text = message.getByText(/Salvataggio non riuscito/);
    expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await text.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(30);
    await text.hover();
    await expect(page.getByRole('tooltip')).toContainText('Ricarica la pagina e riprova.');
  });

  test('a message given later is announced by the status region that was already there', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'visible:!true;message:');
    const status = page.locator('[data-object-page-footer-message]');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toBeEmpty();
    const handle = await status.elementHandle();
    // Another story render with a message would remount; instead write it the way React would: through the
    // controls channel, then check the very same node now holds the text.
    await page.evaluate(() => {
      const channel = (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } })
        .__STORYBOOK_ADDONS_CHANNEL__;
      const id = (window as unknown as { __STORYBOOK_PREVIEW__: { currentRender: { id: string } } }).__STORYBOOK_PREVIEW__.currentRender.id;
      channel.emit('updateStoryArgs', { storyId: id, updatedArgs: { message: 'Errore di salvataggio' } });
    });
    await expect(status).toContainText('Errore di salvataggio');
    expect(await handle!.evaluate((el, now) => el === now, await status.elementHandle())).toBe(true);
  });

  test('axe: hidden, with actions, with a long error', async ({ page }) => {
    for (const name of ['hidden', 'with-actions', 'long-error']) {
      await gotoStory(page, STORY(name));
      await expectNoA11yViolations(page);
    }
  });

  test('zoom 200%: the actions are not cut and the reserved height follows the font size', async ({ page }) => {
    await gotoStory(page, STORY('with-actions'));
    await page.evaluate(() => (document.documentElement.style.fontSize = '32px'));
    const region = page.getByRole('region', { name: 'Save actions' });
    const box = (await region.boundingBox())!;
    expect(box.height).toBe(113);
    for (const name of ['Salva', 'Annulla modifiche']) {
      const b = (await region.getByRole('button', { name }).boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(box.y);
      expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height);
    }
  });
});

test.describe('Object Page footer on a narrow screen', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true });

  test('no horizontal overflow at 320px; the actions share the row; the height is the same with or without message', async ({ page }) => {
    await gotoStory(page, STORY('with-actions'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    const region = page.getByRole('region', { name: 'Save actions' });
    const plain = (await region.boundingBox())!;
    const save = (await region.getByRole('button', { name: 'Salva' }).boundingBox())!;
    const cancel = (await region.getByRole('button', { name: 'Annulla modifiche' }).boundingBox())!;
    expect(Math.abs(save.width - cancel.width)).toBeLessThanOrEqual(1);
    expect(cancel.x + cancel.width).toBeLessThanOrEqual(plain.x + plain.width);
    expect(save.x).toBeGreaterThanOrEqual(plain.x);

    await gotoStory(page, STORY('long-error'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    const withMessage = (await page.locator(FOOTER).boundingBox())!;
    expect(withMessage.height).toBe(plain.height);
    // The message sits above the actions.
    const messageBox = (await page.locator('[data-object-page-footer-message]').boundingBox())!;
    const actionsBox = (await page.locator('[data-object-page-footer-actions]').boundingBox())!;
    expect(messageBox.y + messageBox.height).toBeLessThanOrEqual(actionsBox.y + 1);
  });
});

// Keyboard-safe focus (spec §1.10) with the visual viewport replaced by a controllable stand-in
// (same technique as e2e/object-page-layout.spec.ts).
for (const [name, viewport] of [
  ['mobile', { width: 375, height: 667 }],
  ['tablet', { width: 768, height: 1024 }],
] as const) {
  test.describe(`Object Page footer and the virtual keyboard (${name})`, () => {
    test.use({ viewport, hasTouch: true });

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
    });

    for (const keyboardShare of [0.2, 0.45]) {
      test(`the field of the last section ends above the keyboard and above the footer (keyboard ${keyboardShare * 100}%)`, async ({ page }) => {
        await gotoStory(page, STORY('manual'), 'visible:!true');
        const input = page.getByRole('textbox', { name: 'Note interne' });
        await page.locator(SCROLLER).evaluate((el) => (el.scrollTop = el.scrollHeight));
        const keyboard = Math.round(viewport.height * keyboardShare);
        await input.focus();
        await page.evaluate((n) => (window as unknown as KeyboardWindow).__setKeyboard(n), keyboard);

        const rects = () =>
          page.evaluate((sel) => {
            const field = document.activeElement!.getBoundingClientRect();
            const footer = document.querySelector(sel)!.getBoundingClientRect();
            return { fieldTop: field.top, fieldBottom: field.bottom, footerTop: footer.top, footerBottom: footer.bottom };
          }, FOOTER);
        const keyboardTop = viewport.height - keyboard;
        await expect.poll(async () => (await rects()).fieldBottom).toBeLessThanOrEqual(keyboardTop);
        const r = await rects();
        expect(r.fieldTop).toBeGreaterThanOrEqual(0);
        // The footer is inside the visible viewport when the keyboard has not reached it: then the field is above it too.
        if (r.footerBottom <= keyboardTop) expect(r.fieldBottom).toBeLessThanOrEqual(r.footerTop);
        // Whatever the keyboard does, the field stays above the footer's top edge (the footer is outside the scroller).
        expect(r.fieldBottom).toBeLessThanOrEqual(r.footerTop + 1);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
      });
    }
  });
}
