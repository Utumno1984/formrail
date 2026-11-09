import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations, settleMotion } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass } from './helpers/story';

const STORY = (name: string) => `overlays-confirmdialog--${name}`;
const TITLE = 'Delete invoice 2026/0142?';

const confirmDialog = (page: Page, name = TITLE) => page.getByRole('dialog', { name });
/** The page is aria-hidden while a dialog is open: the opener is found by text, not by role. */
const opener = (page: Page) => page.locator('button', { hasText: /^Delete…$/ });
/** How many times the demo's `onConfirm` completed (written on the page by the story). */
const deletedText = (page: Page) => page.locator('#storybook-root [role="status"]');

/** Records whether the focus ever lands on `body` from now on (checked on every focus change and frame). */
async function watchFocusLoss(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    const w = window as unknown as { __lost: boolean; __watch: boolean };
    w.__lost = false;
    w.__watch = true;
    const check = () => {
      if (w.__watch && (document.activeElement === document.body || document.activeElement === null)) w.__lost = true;
    };
    document.addEventListener('focusout', () => setTimeout(check, 0), true);
    const loop = () => {
      check();
      if (w.__watch) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  return () =>
    page.evaluate(() => {
      const w = window as unknown as { __lost: boolean; __watch: boolean };
      w.__watch = false;
      return w.__lost;
    });
}

test.describe('Overlays/ConfirmDialog: stories play', () => {
  for (const name of [
    'delete-with-server-round-trip',
    'server-error',
    'danger',
    'default-tone',
    'pending',
    'long-label',
    'from-a-menu-item',
    'with-use-confirm-dialog',
    'inside-a-sheet',
    'over-a-dialog',
  ]) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('semantics and initial focus', () => {
  test('opened from state: role dialog, aria-modal, name, description, focus trap, page inert, axe', async ({ page }) => {
    await expectPlayToPass(page, STORY('delete-with-server-round-trip'));
    await opener(page).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleDescription(
      'The invoice and its 3 attachments are deleted for good. This cannot be undone.',
    );
    // Announced as a dialog in the accessibility tree (not only the attribute in the DOM).
    const snapshot = await page.locator('body').ariaSnapshot();
    expect(snapshot).toContain(`dialog "${TITLE}"`);
    await expect(page.getByRole('button', { name: 'Delete…' })).toHaveCount(0);

    const inside = () => dialog.evaluate((el) => el.contains(document.activeElement));
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      expect(await inside()).toBe(true);
    }
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside()).toBe(true);
    }
    await settleMotion(page);
    await expectNoA11yViolations(page);
  });

  test('tone="danger": the focus starts on Cancel, never on the panel; Enter cancels', async ({ page }) => {
    await expectPlayToPass(page, STORY('delete-with-server-round-trip'));
    await opener(page).click();
    const dialog = confirmDialog(page);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(dialog).not.toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    // Still the one deletion of the play: Enter cancelled.
    await expect(deletedText(page)).toHaveText('Deleted (1)');
    await expect(opener(page)).toBeFocused();
  });

  test('tone="default": the focus starts on the confirm button; Enter confirms once', async ({ page }) => {
    await expectPlayToPass(page, STORY('delete-with-server-round-trip'), 'tone:default;pendingMs:0');
    await opener(page).click();
    const dialog = confirmDialog(page);
    await expect(dialog.getByRole('button', { name: 'Delete invoice' })).toBeFocused();
    // The play already deleted once.
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(deletedText(page)).toHaveText('Deleted (2)');
    await expect(opener(page)).toBeFocused();
  });

  test('reopened while the exit animation is still running: the focus goes to Cancel, not to the panel', async ({ page }) => {
    await expectPlayToPass(page, STORY('delete-with-server-round-trip'));
    await opener(page).click();
    const dialog = confirmDialog(page);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await settleMotion(page);
    // Reopen right after the commit that marks the panel closed (still mounted, exit animation running).
    await dialog.evaluate((node) => {
      const w = window as unknown as { __reused?: boolean };
      const observer = new MutationObserver(() => {
        if (node.getAttribute('data-state') !== 'closed') return;
        observer.disconnect();
        w.__reused = node.isConnected;
        // As a mouse click does: the opener takes the focus, then the click reopens the dialog.
        const reopen = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Delete…') as HTMLButtonElement;
        reopen.focus();
        reopen.click();
      });
      observer.observe(node, { attributes: true, attributeFilter: ['data-state'] });
    });
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __reused?: boolean }).__reused)).toBe(true);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(dialog).not.toBeFocused();
  });

  test('with reduced motion: no animation, same initial focus and return', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectPlayToPass(page, STORY('delete-with-server-round-trip'));
    await opener(page).click();
    const dialog = confirmDialog(page);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
  });
});

test.describe('synchronous confirm and cancel (pendingMs 0)', () => {
  test('click on confirm: one call, closes, the focus returns to the opener', async ({ page }) => {
    await expectPlayToPass(page, STORY('delete-with-server-round-trip'), 'pendingMs:0');
    await expect(deletedText(page)).toHaveText('Deleted (1)');
    await opener(page).click();
    await confirmDialog(page).getByRole('button', { name: 'Delete invoice' }).click();
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(deletedText(page)).toHaveText('Deleted (2)');
    await expect(opener(page)).toBeFocused();
  });

  for (const [name, cancel] of [
    ['Cancel', (page: Page) => confirmDialog(page).getByRole('button', { name: 'Cancel' }).click()],
    ['Escape', (page: Page) => page.keyboard.press('Escape')],
    ['the backdrop', (page: Page) => page.mouse.click(4, 4)],
  ] as const) {
    test(`${name} closes without confirming and returns the focus`, async ({ page }) => {
      await expectPlayToPass(page, STORY('delete-with-server-round-trip'), 'pendingMs:0');
      await opener(page).click();
      await expect(confirmDialog(page)).toBeVisible();
      await cancel(page);
      await expect(confirmDialog(page)).toHaveCount(0);
      await expect(deletedText(page)).toHaveText('Deleted (1)');
      await expect(opener(page)).toBeFocused();
    });
  }
});

test.describe('pending (onConfirm returns a promise)', () => {
  test('double click and repeated Enter: one call; aria-disabled + spinner, same name; nothing closes it; the focus is never on body', async ({
    page,
  }) => {
    await expectPlayToPass(page, STORY('delete-with-server-round-trip'), 'pendingMs:1500');
    await expect(deletedText(page)).toHaveText('Deleted (1)');
    await opener(page).click();
    const dialog = confirmDialog(page);
    const confirm = dialog.getByRole('button', { name: 'Delete invoice' });
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeFocused();
    const lost = await watchFocusLoss(page);

    await confirm.dblclick();
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await expect(confirm).toHaveAccessibleName('Delete invoice');
    await expect(confirm.locator('svg')).toHaveCount(1);
    await expect(cancel).toHaveAttribute('aria-disabled', 'true');

    await page.keyboard.press('Escape');
    await page.mouse.click(4, 4);
    // `force`: Playwright treats aria-disabled as "not enabled" and would wait; the real click is the point.
    await cancel.click({ force: true });
    await confirm.click({ force: true });
    await expect(dialog).toBeVisible();
    await expect(confirm).toBeFocused();
    // Read while still pending: after the close the focus is on `body` for a frame by design, until
    // the Dialog returns it to the opener (checked below).
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(await lost()).toBe(false);

    await expect(dialog).toHaveCount(0, { timeout: 5000 });
    // Exactly one more completed deletion, not two or three.
    await expect(deletedText(page)).toHaveText('Deleted (2)');
    await expect(opener(page)).toBeFocused();
  });

  test('rejected: stays open, interactive again, the focus stays on the confirm button, the error is shown', async ({ page }) => {
    await expectPlayToPass(page, STORY('server-error'));
    await opener(page).click();
    const dialog = confirmDialog(page);
    const confirm = dialog.getByRole('button', { name: 'Delete invoice' });
    await confirm.click();
    await expect(dialog.getByText('The invoice is already paid and cannot be deleted.')).toBeVisible();
    await expect(confirm).not.toHaveAttribute('aria-disabled');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
  });
});

test.describe('from a menu item', () => {
  test('cancelled: the focus returns to the menu trigger (returnFocusRef)', async ({ page }) => {
    await expectPlayToPass(page, STORY('from-a-menu-item'));
    const trigger = page.locator('button', { hasText: 'More actions' });
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    const dialog = confirmDialog(page);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('a fast double Enter on the item does not confirm: the second one lands on Cancel', async ({ page }) => {
    // After the play has finished, so that it does not race with this test.
    await expectPlayToPass(page, STORY('from-a-menu-item'));
    const trigger = page.locator('button', { hasText: 'More actions' });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // Cancelled, not confirmed (a confirmation would also have closed it: the page tells which).
    await expect(deletedText(page)).toHaveText('');
  });
});

test.describe('stacked on another panel', () => {
  for (const [story, panel, closer] of [
    ['inside-a-sheet', 'Edit supplier', 'Close editor'],
    ['over-a-dialog', 'Edit supplier', 'Discard'],
  ] as const) {
    test(`${story}: on top, Escape closes only the confirmation, the focus goes back into the panel`, async ({ page }) => {
      await expectPlayToPass(page, STORY(story));
      const under = page.getByRole('dialog', { name: panel });
      // The sheet story's play leaves the sheet open; the dialog story's closes everything.
      if ((await under.count()) === 0) await page.locator('button', { hasText: 'Edit supplier' }).click();
      await expect(under).toBeVisible();
      const closeButton = under.getByRole('button', { name: closer });
      await closeButton.click();
      const top = confirmDialog(page, 'Discard changes?');
      await expect(top).toBeVisible();
      await settleMotion(page);

      // The element on top at the confirmation's centre belongs to it; at the panel's centre (outside the
      // confirmation) it is the confirmation's backdrop, not the panel.
      const hits = await page.evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role=dialog]'));
        const confirmation = dialogs.find((d) => d.textContent?.includes('Discard changes?'))!;
        const panelNode = dialogs.find((d) => d !== confirmation)!;
        const c = confirmation.getBoundingClientRect();
        const p = panelNode.getBoundingClientRect();
        const atConfirm = document.elementFromPoint(c.left + c.width / 2, c.top + 8);
        const atPanel = document.elementFromPoint(p.left + 4, p.top + 4);
        return {
          confirmOnTop: !!atConfirm && confirmation.contains(atConfirm),
          panelCovered: !!atPanel && !panelNode.contains(atPanel),
        };
      });
      expect(hits).toEqual({ confirmOnTop: true, panelCovered: true });

      await page.keyboard.press('Escape');
      await expect(top).toHaveCount(0);
      await expect(under).toBeVisible();
      await expect(closeButton).toBeFocused();
    });
  }
});

test.describe('layout', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('mobile, long label: both buttons visible and reachable, the label wraps, no horizontal overflow', async ({ page }) => {
    await expectPlayToPass(page, STORY('long-label'));
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectNoHorizontalOverflow(dialog);
    const confirm = dialog.getByRole('button', { name: /^Delete invoice 2026\/0142 and its 3 attachments/ });
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    for (const button of [confirm, cancel]) {
      await expect(button).toBeInViewport({ ratio: 1 });
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    // Wrapped onto more than one line (taller than a one-line button).
    expect((await confirm.boundingBox())!.height).toBeGreaterThan((await cancel.boundingBox())!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await cancel.tap();
    await expect(dialog).toHaveCount(0);
  });

  test('mobile with the on-screen keyboard (smaller visual viewport): the footer stays above it', async ({ page }) => {
    await page.addInitScript(() => {
      const target = new EventTarget();
      const vv = Object.defineProperties(target, {
        offsetTop: { value: 0 },
        offsetLeft: { value: 0 },
        pageTop: { value: 0 },
        pageLeft: { value: 0 },
        scale: { value: 1 },
        height: { get: () => window.innerHeight - 300 },
        width: { get: () => window.innerWidth },
      });
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    });
    await expectPlayToPass(page, STORY('long-label'));
    const dialog = page.getByRole('dialog');
    const limit = 667 - 300;
    await expect.poll(async () => (await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height).toBeLessThanOrEqual(limit);
    for (const name of ['Cancel', /^Delete invoice 2026\/0142 and its 3 attachments/]) {
      const box = (await dialog.getByRole('button', { name }).boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(limit);
    }
  });
});

test.describe('no leak', () => {
  test('control props never reach the DOM, and nothing is logged', async ({ page }) => {
    const logged: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logged.push(m.text());
    });
    await expectPlayToPass(page, STORY('danger'));
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    const names = await dialog.evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll('*'))].flatMap((n) => n.getAttributeNames().map((a) => a.toLowerCase())),
    );
    for (const forbidden of ['tone', 'onconfirm', 'oncancel', 'confirmlabel', 'cancellabel', 'onerror', 'returnfocusref', 'session']) {
      expect(names).not.toContain(forbidden);
    }
    expect(logged).toEqual([]);
  });
});
