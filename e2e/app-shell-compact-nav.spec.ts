import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';
import { MOBILE_VIEWPORT, VIEWPORTS } from './helpers/viewports';

// #641: below 64rem the navigation of the app shell opens in a Sheet from `AppShellNavTrigger`.
const ID = 'floorplans-app-shell--';
const COMPACT = `${ID}compact-navigation`;
const PORTRAIT_TABLET = { width: 768, height: 1024 };
const LANDSCAPE_TABLET = { width: 1024, height: 768 };

const trigger = (page: Page) => page.locator('[data-rop-app-shell-nav-trigger]');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Main' });
const column = (page: Page) => page.locator('[data-rop-app-shell-nav]');
const heading = (page: Page) => page.locator('main h1');

// Records, for every click that reaches the document, whether a handler already cancelled it (what the browser sees
// when it decides to navigate), then cancels it so the test page does not leave the story or open a tab.
async function recordClicks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __clicks: string[] };
    w.__clicks = [];
    document.addEventListener('click', (event) => {
      w.__clicks.push(`click:${event.defaultPrevented}`);
      event.preventDefault();
    });
  });
}
const clicks = (page: Page) => page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);

/** Updates the args of the current story the way the Controls panel does (no remount). */
const setArgs = (page: Page, updatedArgs: Record<string, unknown>) =>
  page.evaluate((args) => {
    const w = window as unknown as {
      __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
      __STORYBOOK_PREVIEW__: { currentRender: { id: string } };
    };
    w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId: w.__STORYBOOK_PREVIEW__.currentRender.id, updatedArgs: args });
  }, updatedArgs);

/** Opens the story at the width of a phone, the Sheet closed (the play of CompactNavigation leaves it closed). */
async function openCompact(page: Page, size: { width: number; height: number } = MOBILE_VIEWPORT, id = COMPACT): Promise<void> {
  await page.setViewportSize(size);
  await expectPlayToPass(page, id);
}

async function openSheetWithKeyboard(page: Page): Promise<Locator> {
  await trigger(page).focus();
  await page.keyboard.press('Enter');
  await expect(sheet(page)).toBeVisible();
  return sheet(page);
}

test.describe('Floorplans/App Shell: compact navigation', () => {
  for (const [name, width, height] of VIEWPORTS) {
    test(`${name}: the play functions of the compact stories pass`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const id of ['', '-open', '-focus-on-the-new-page', '-with-dirty-guard', '-with-many-links']) {
        await expectPlayToPass(page, `${COMPACT}${id}`);
      }
    });
  }

  for (const size of [LANDSCAPE_TABLET, { width: 1280, height: 800 }]) {
    test(`${size.width}px: the trigger is not displayed and not a Tab stop; the column is there`, async ({ page }) => {
      await page.setViewportSize(size);
      await gotoStory(page, COMPACT);
      await expect(trigger(page)).toBeHidden();
      await expect(column(page)).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(column(page).getByRole('link', { name: 'Section A' })).toBeFocused();
    });
  }

  test('1023px: the trigger is displayed, the column is not (the same breakpoint)', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 768 });
    await gotoStory(page, COMPACT);
    await expect(trigger(page)).toBeVisible();
    await expect(column(page)).toBeHidden();
  });

  test('mobile, keyboard: named trigger, the Sheet with the focus on the current link, the page inert, Escape returns the focus', async ({ page }) => {
    // The play (Tab from the top of the page: the skip link, then the trigger) leaves Section B current, the Sheet
    // closed and the focus on the trigger. Here the trigger is reached again from the skip link, its previous stop.
    await openCompact(page);
    const button = page.getByRole('button', { name: 'Open navigation' });
    await expect(button).toBeFocused();
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).not.toHaveAttribute('aria-controls');
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    const panel = sheet(page);
    await expect(panel).toBeVisible();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page)).toHaveAttribute('aria-controls', (await panel.getAttribute('id'))!);
    await expect(panel.getByRole('link', { name: 'Section B' })).toBeFocused();
    await expect(panel.getByRole('heading', { name: 'Main' })).toBeVisible();
    // The Sheet comes from the left edge (at the end of its entry animation, a slide) and is as tall as the window.
    await expect.poll(async () => (await panel.boundingBox())!.x).toBe(0);
    const box = (await panel.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.height).toBe(MOBILE_VIEWPORT.height);
    // The rest of the page is inert: Tab stays in the Sheet.
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('mobile, Sheet open: one navigation landmark named Main, no duplicate id, no axe violation', async ({ page }) => {
    await openCompact(page, MOBILE_VIEWPORT, `${COMPACT}-open`);
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(1);
    await expect(sheet(page).getByRole('navigation', { name: 'Main' })).toHaveCount(1);
    // Every link of the navigation is mounted once, in the Sheet.
    await expect(page.locator('[data-rop-app-shell-nav-link]')).toHaveCount(5);
    await expect(column(page).locator('[data-rop-app-shell-nav-link]')).toHaveCount(0);
    const duplicates = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    });
    expect(duplicates).toEqual([]);
    await expectNoA11yViolations(page);
  });

  test('mobile: choosing a link closes the Sheet, the focus is on the trigger, the page and aria-current follow', async ({ page }) => {
    await openCompact(page);
    await expect(heading(page)).toHaveText('Section B');
    await trigger(page).click();
    await recordClicks(page);
    await sheet(page).getByRole('link', { name: 'Section D' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await expect(heading(page)).toHaveText('Section D');
    expect(await clicks(page)).toEqual(['click:true']);
    // The column (not displayed here) holds the links again, the current one moved.
    await expect(column(page).locator('[aria-current="page"]')).toHaveText('Section D');
    await openSheetWithKeyboard(page);
    await expect(sheet(page).getByRole('link', { name: 'Section D' })).toBeFocused();
    await expect(sheet(page).getByRole('link', { name: 'Section D' })).toHaveAttribute('aria-current', 'page');
  });

  test("mobile: Ctrl+click on a link is the browser's: not cancelled, the Sheet stays open, the page stays", async ({ page }) => {
    await openCompact(page);
    await trigger(page).click();
    await recordClicks(page);
    await sheet(page).getByRole('link', { name: 'Section D' }).click({ modifiers: ['Control'] });
    expect(await clicks(page)).toEqual(['click:false']);
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAttribute('data-state', 'open');
    await expect(heading(page)).toHaveText('Section B');
  });

  test('@touch a tap on the trigger opens the Sheet and it stays open; a tap on a link closes it and navigates', async ({ page }) => {
    await openCompact(page);
    await trigger(page).tap();
    await expect(sheet(page)).toBeVisible();
    // The end of the tap that opened it did not land on the panel or its backdrop.
    await expect(sheet(page)).toHaveAttribute('data-state', 'open');
    await expect(sheet(page).getByRole('link', { name: 'Section B' })).toBeFocused();
    await sheet(page).getByRole('link', { name: 'Section E' }).tap();
    await expect(sheet(page)).toHaveCount(0);
    await expect(heading(page)).toHaveText('Section E');
    await expect(trigger(page)).toBeFocused();
    // A tap on the backdrop closes it too, and the focus goes back to the trigger.
    await trigger(page).tap();
    await expect(sheet(page)).toHaveAttribute('data-state', 'open');
    await page.touchscreen.tap(MOBILE_VIEWPORT.width - 6, MOBILE_VIEWPORT.height / 2);
    await expect(sheet(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test('a tablet turned to landscape with the Sheet open: the Sheet closes, the column is there with the focus on its current link', async ({ page }) => {
    await page.setViewportSize(PORTRAIT_TABLET);
    await gotoStory(page, `${COMPACT}-open`);
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('link', { name: 'Section B' })).toBeFocused();
    await page.setViewportSize(LANDSCAPE_TABLET);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(column(page)).toBeVisible();
    const current = column(page).getByRole('link', { name: 'Section B' });
    await expect(current).toBeFocused();
    // Still there once the Sheet's own return of the focus has run.
    await page.waitForTimeout(800);
    await expect(current).toBeFocused();
    await expect(trigger(page)).toBeHidden();

    // Back to portrait with the focus in the column: the focus goes to the trigger, not to the page.
    await column(page).getByRole('link', { name: 'Section C' }).focus();
    await page.setViewportSize(PORTRAIT_TABLET);
    await expect(trigger(page)).toBeFocused();
    await expect(column(page)).toBeHidden();
  });

  for (const [name, size] of [['narrow', PORTRAIT_TABLET], ['wide', LANDSCAPE_TABLET]] as const) {
    test(`the nav unmounted with the Sheet open closes it; mounted again (${name}) it opens nothing and takes no focus`, async ({ page }) => {
      await page.setViewportSize(PORTRAIT_TABLET);
      await gotoStory(page, `${COMPACT}-open`);
      await expect(sheet(page)).toBeVisible();
      await setArgs(page, { navCount: 0 });
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger(page)).not.toHaveAttribute('aria-controls');
      // The focus the Sheet held goes back to the trigger, as at any closing, before the user moves it.
      await expect(trigger(page)).toBeFocused();
      // The page is not inert any more: the user moves on, then the navigation comes back (permissions loaded later).
      const details = page.getByRole('link', { name: 'Details of block 1' });
      await details.focus();
      await page.setViewportSize(size);
      await setArgs(page, { navCount: 5 });
      // The nav is back: in the column when wide; when narrow the column is hidden (its links are in the DOM, not in
      // the accessibility tree) and the way to it is the trigger.
      if (name === 'wide') await expect(column(page).getByRole('link')).toHaveCount(5);
      else {
        await expect(column(page)).toBeHidden();
        await expect(column(page).locator('a')).toHaveCount(5);
        await expect(trigger(page)).toBeVisible();
      }
      // Longer than the Sheet's entry and exit animations.
      await page.waitForTimeout(800);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger(page)).not.toHaveAttribute('aria-controls');
      await expect(details).toBeFocused();
    });
  }

  for (const motion of ['no-preference', 'reduce'] as const) {
    test(`mobile (${motion}): the nav unmounted with the Sheet open gives the focus it held to the trigger, and keeps it there`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await openCompact(page, MOBILE_VIEWPORT, `${COMPACT}-open`);
      await expect(sheet(page).getByRole('link', { name: 'Section B' })).toBeFocused();
      await setArgs(page, { navCount: 0 });
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(trigger(page)).toBeFocused();
      // Longer than the Sheet's exit animation: nothing takes it away afterwards.
      await page.waitForTimeout(800);
      await expect(trigger(page)).toBeFocused();
    });

    // The Sheet reopened while its exit animation runs: its panel is the same node (it never left the DOM), and the
    // focus still starts on the current link, not on the panel. With reduced motion there is no exit animation: the
    // panel has left at once and a new one opens (the same focus, by the ordinary opening).
    test(`mobile (${motion}): Escape, then a click on the trigger during the exit: the focus on the current link`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await openCompact(page, MOBILE_VIEWPORT, `${COMPACT}-open`);
      await expect(sheet(page).getByRole('link', { name: 'Section B' })).toBeFocused();
      await page.evaluate(() => {
        (window as unknown as { __panel: Element | null }).__panel = document.querySelector('[role="dialog"]');
      });
      const box = (await trigger(page).boundingBox())!;
      await page.keyboard.press('Escape');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(sheet(page).getByRole('link', { name: 'Section B' })).toBeFocused();
      const reused = await page.evaluate(
        () => document.querySelector('[role="dialog"]') === (window as unknown as { __panel: Element | null }).__panel,
      );
      expect(reused).toBe(motion === 'no-preference');
      await page.waitForTimeout(400);
      await expect(sheet(page).getByRole('link', { name: 'Section B' })).toBeFocused();
    });

    test(`tablet (${motion}): reopened with Enter during the exit a turn to landscape and back began: the focus on the current link`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await openCompact(page, PORTRAIT_TABLET, `${COMPACT}-open`);
      await expect(sheet(page).getByRole('link', { name: 'Section B' })).toBeFocused();
      await page.evaluate(() => {
        (window as unknown as { __panel: Element | null }).__panel = document.querySelector('[role="dialog"]');
      });
      await page.setViewportSize(LANDSCAPE_TABLET);
      await expect(column(page).getByRole('link', { name: 'Section B' })).toBeFocused();
      await page.setViewportSize(PORTRAIT_TABLET);
      await expect(trigger(page)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(sheet(page).getByRole('link', { name: 'Section B' })).toBeFocused();
      const reused = await page.evaluate(
        () => document.querySelector('[role="dialog"]') === (window as unknown as { __panel: Element | null }).__panel,
      );
      expect(reused).toBe(motion === 'no-preference');
      await page.waitForTimeout(400);
      await expect(sheet(page).getByRole('link', { name: 'Section B' })).toBeFocused();
    });
  }

  test('portrait with the focus in the page, not in the column: it stays there', async ({ page }) => {
    await page.setViewportSize(LANDSCAPE_TABLET);
    await gotoStory(page, COMPACT);
    const details = page.getByRole('link', { name: 'Details of block 1' });
    await details.focus();
    await page.setViewportSize(PORTRAIT_TABLET);
    await page.waitForTimeout(200);
    await expect(details).toBeFocused();
  });

  test('more links than the Sheet holds: they scroll inside the Sheet, the page does not', async ({ page }) => {
    await openCompact(page, MOBILE_VIEWPORT, `${COMPACT}-with-many-links`);
    const panel = sheet(page);
    const body = panel.locator('[data-rop-app-shell-nav-sheet-nav]').locator('..');
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await expectSingleScroller(panel);
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    await expect(panel.getByRole('heading', { name: 'Main' })).toBeInViewport();
    await expect(panel.getByRole('link', { name: 'Section T' })).toBeInViewport();
  });

  test('a focus onNavigate moves to the heading of the new page is still there 800ms later', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStory(page, `${COMPACT}-focus-on-the-new-page`);
    await trigger(page).click();
    await sheet(page).getByRole('link', { name: 'Section D' }).click();
    await expect(heading(page)).toHaveText('Section D');
    await expect(heading(page)).toBeFocused();
    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(heading(page)).toBeFocused();
  });

  test('useDirtyGuard: the Sheet is closed when it asks; "Keep editing" returns the focus to the trigger, "Leave" navigates', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStory(page, `${COMPACT}-with-dirty-guard`);
    await page.getByRole('textbox', { name: 'Name' }).fill('Changed value');
    const pick = async () => {
      await trigger(page).click();
      await sheet(page).getByRole('link', { name: 'Section C' }).click();
    };
    await pick();
    const question = page.getByRole('dialog', { name: 'Unsaved changes' });
    await expect(question).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    await question.getByRole('button', { name: 'Keep editing' }).click();
    await expect(question).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await page.waitForTimeout(500);
    await expect(trigger(page)).toBeFocused();
    await expect(heading(page)).toHaveText('Section A');
    await pick();
    await question.getByRole('button', { name: 'Leave without saving' }).click();
    await expect(heading(page)).toHaveText('Section C');
  });

  test('in a right-to-left page the Sheet comes from the right edge', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStory(page, COMPACT);
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await trigger(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAttribute('data-state', 'open');
    await expect.poll(async () => {
      const box = (await sheet(page).boundingBox())!;
      return Math.round(box.x + box.width);
    }).toBe(MOBILE_VIEWPORT.width);
  });

  test('the Sheet and its backdrop cover the header (modal level, no layer of the shell)', async ({ page }) => {
    await openCompact(page, MOBILE_VIEWPORT, `${COMPACT}-open`);
    const top = await page.evaluate(() => {
      const box = document.querySelector('header')!.getBoundingClientRect();
      const el = document.elementFromPoint(box.right - 10, box.top + box.height / 2);
      return el?.closest('header') ? 'header' : 'overlay';
    });
    expect(top).toBe('overlay');
  });
});

// Virtual keyboard (spec §1.10): a desktop browser has no on-screen keyboard, so the visual viewport is a
// controllable stand-in (same technique as e2e/sheet.spec.ts). A search field of the consumer at the end of the
// navigation, in the Sheet, stays above the keyboard.
test.describe('Floorplans/App Shell: compact navigation and the virtual keyboard', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('the focused search field at the end of a long navigation stays above the keyboard', async ({ page }) => {
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
      (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard = (px) => {
        keyboard = px;
        target.dispatchEvent(new Event('resize'));
      };
    });
    await expectPlayToPass(page, `${COMPACT}-with-many-links`);
    const panel = sheet(page);
    const search = panel.getByRole('searchbox', { name: 'Search the sections' });
    await expect(search).toBeFocused();
    const keyboard = 300;
    await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), keyboard);
    const limit = 667 - keyboard;
    await expect.poll(async () => {
      const box = (await panel.boundingBox())!;
      return box.y + box.height;
    }).toBeLessThanOrEqual(limit);
    // The field, focused at the bottom of the scrolled links, is brought above the keyboard (by the Field itself,
    // inside the Sheet's body, which ends where the visible viewport ends).
    await expect.poll(async () => {
      const box = (await search.boundingBox())!;
      return box.y + box.height;
    }).toBeLessThanOrEqual(limit);
    expect((await search.boundingBox())!.y).toBeGreaterThanOrEqual((await panel.getByRole('heading', { name: 'Main' }).boundingBox())!.y);
    await expect(search).toBeFocused();
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  });
});
