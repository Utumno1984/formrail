import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-fileupload--${name}`;
const CHOOSE = (page: Page): Locator => page.getByRole('button', { name: 'Invoice attachments Choose files' });
const nativeInput = (page: Page): Locator => page.locator('input[type="file"]');
const dropZone = (page: Page): Locator => nativeInput(page).locator('..');
const changeCalls = (page: Page): Locator => page.getByTestId('change-calls');
const rejectCalls = (page: Page): Locator => page.getByTestId('reject-calls');
const items = (page: Page): Locator => page.getByRole('listitem');

interface Spec {
  name: string;
  type?: string;
  size?: number;
}
const buffer = (name: string, size = 100) => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(size, 1) });

/** Builds a DataTransfer with synthetic files in the page. */
async function dataTransfer(page: Page, files: Spec[]) {
  return page.evaluateHandle((specs) => {
    const dt = new DataTransfer();
    for (const { name, type, size } of specs) {
      dt.items.add(new File([new Uint8Array(size ?? 10)], name, { type: type ?? 'application/pdf' }));
    }
    return dt;
  }, files);
}

async function drop(page: Page, target: Locator, files: Spec[]) {
  const dt = await dataTransfer(page, files);
  await target.dispatchEvent('dragenter', { dataTransfer: dt });
  await target.dispatchEvent('dragover', { dataTransfer: dt });
  await target.dispatchEvent('drop', { dataTransfer: dt });
}

test.describe('Forms/FileUpload: stories play', () => {
  for (const name of ['invoice-attachments', 'single-file', 'dragging']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('picker', () => {
  test('click, Enter and Space open the native picker; the chosen files arrive once', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    for (const press of [async () => CHOOSE(page).click(), async () => page.keyboard.press('Enter'), async () => page.keyboard.press('Space')]) {
      const chooser = page.waitForEvent('filechooser');
      await press();
      await (await chooser).setFiles([]);
    }
    await expect(changeCalls(page)).toHaveText('0');

    const chooser = page.waitForEvent('filechooser');
    await CHOOSE(page).click();
    await (await chooser).setFiles([buffer('a.pdf', 1500), buffer('b.pdf', 2_500_000)]);
    await expect(items(page)).toHaveCount(2);
    await expect(changeCalls(page)).toHaveText('1');
    await expect(items(page).first()).toContainText('a.pdf');
    await expect(items(page).first()).toContainText('1.5 kB');
    await expect(items(page).nth(1)).toContainText('2.5 MB');
  });

  test('the Field label opens the picker too, and the combined accessible name is label + button text', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    await expect(CHOOSE(page)).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('label', { hasText: 'Invoice attachments' }).click();
    await (await chooser).setFiles(buffer('a.pdf'));
    await expect(items(page)).toHaveCount(1);
  });

  test('the same file can be chosen again after it was removed', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    for (let i = 0; i < 2; i++) {
      await nativeInput(page).setInputFiles(buffer('same.pdf'));
      await expect(items(page)).toHaveCount(1);
      await page.getByRole('button', { name: 'Remove same.pdf' }).click();
      await expect(items(page)).toHaveCount(0);
    }
    await expect(changeCalls(page)).toHaveText('4');
  });

  test('a rejected file from the picker shows the message in the Field and reports onReject once', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    await nativeInput(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await expect(page.getByText('"notes.txt" is not an allowed file type.')).toBeVisible();
    await expect(rejectCalls(page)).toHaveText('1');
    await expect(changeCalls(page)).toHaveText('0');
    await expect(items(page)).toHaveCount(0);
  });
});

test.describe('drag & drop', () => {
  test('dropped files arrive once; a .exe with accept=".pdf" is rejected and the valid ones still enter', async ({ page }) => {
    await gotoStory(page, STORY('playground'), 'accept:.pdf');
    await drop(page, dropZone(page), [{ name: 'a.pdf' }, { name: 'virus.exe', type: 'application/x-msdownload' }]);
    await expect(items(page)).toHaveCount(1);
    await expect(items(page)).toContainText('a.pdf');
    await expect(changeCalls(page)).toHaveText('1');
    await expect(rejectCalls(page)).toHaveText('1');
    await expect(page.getByText('"virus.exe" is not an allowed file type.')).toBeVisible();
  });

  test('a drop of only a .exe changes nothing and does not call onValueChange', async ({ page }) => {
    await gotoStory(page, STORY('playground'), 'accept:.pdf');
    await drop(page, dropZone(page), [{ name: 'virus.exe', type: 'application/x-msdownload' }]);
    await expect(items(page)).toHaveCount(0);
    await expect(changeCalls(page)).toHaveText('0');
    await expect(rejectCalls(page)).toHaveText('1');
  });

  test('too large and too many files are rejected with their own message', async ({ page }) => {
    await gotoStory(page, STORY('playground'), 'maxFiles:2;maxSize:1000');
    await drop(page, dropZone(page), [{ name: 'big.pdf', size: 5000 }, { name: 'a.pdf' }, { name: 'b.pdf' }, { name: 'c.pdf' }]);
    await expect(items(page)).toHaveCount(2);
    await expect(page.getByText('"big.pdf" is too large.')).toBeVisible();
    await expect(page.getByText('"c.pdf" was not added: too many files.')).toBeVisible();
    await expect(rejectCalls(page)).toHaveText('1');
  });

  test('data-dragging does not flicker over a child, and clears when the drag leaves or is dropped elsewhere', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    const area = dropZone(page);
    const child = CHOOSE(page);
    const dt = await dataTransfer(page, [{ name: 'a.pdf' }]);
    await area.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(area).toHaveAttribute('data-dragging', 'true');
    // The browser fires enter on the child before leave on the parent.
    await child.dispatchEvent('dragenter', { dataTransfer: dt });
    await area.dispatchEvent('dragleave', { dataTransfer: dt });
    await expect(area).toHaveAttribute('data-dragging', 'true');
    await child.dispatchEvent('dragleave', { dataTransfer: dt });
    await expect(area).not.toHaveAttribute('data-dragging');
    // Leaving the area and dropping outside leaves nothing lit.
    await area.dispatchEvent('dragenter', { dataTransfer: dt });
    await area.dispatchEvent('dragleave', { dataTransfer: dt });
    await page.locator('body').dispatchEvent('drop', { dataTransfer: dt });
    await expect(area).not.toHaveAttribute('data-dragging');
    await expect(items(page)).toHaveCount(0);
  });

  test('dragover and drop are cancelled (the browser does not open the file); a non-file drag is not', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    const result = await dropZone(page).evaluate((el) => {
      const files = new DataTransfer();
      files.items.add(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
      const text = new DataTransfer();
      text.setData('text/plain', 'hello');
      const fire = (type: string, dataTransfer: DataTransfer) => {
        const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return {
        fileOver: fire('dragover', files),
        fileDrop: fire('drop', files),
        textOver: fire('dragover', text),
        textDrop: fire('drop', text),
      };
    });
    expect(result).toEqual({ fileOver: true, fileDrop: true, textOver: false, textDrop: false });
    await expect(changeCalls(page)).toHaveText('1');
  });

  test('a text drag lights nothing and calls nothing', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    await dropZone(page).evaluate((el) => {
      const text = new DataTransfer();
      text.setData('text/plain', 'hello');
      for (const type of ['dragenter', 'dragover', 'drop']) {
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: text }));
      }
    });
    await expect(dropZone(page)).not.toHaveAttribute('data-dragging');
    await expect(changeCalls(page)).toHaveText('0');
    await expect(rejectCalls(page)).toHaveText('0');
  });
});

test.describe('list, focus and announcements', () => {
  test('keyboard removal moves the focus to the next file, then the previous, then Choose files', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    await nativeInput(page).setInputFiles([buffer('a.pdf'), buffer('b.pdf'), buffer('c.pdf')]);
    await page.getByRole('button', { name: 'Remove a.pdf' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove b.pdf' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Remove c.pdf' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Remove b.pdf' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(CHOOSE(page)).toBeFocused();
  });

  test('the live region announces the count after an add and a remove, once per change', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    const status = page.getByRole('status');
    await expect(status).toBeEmpty();
    await nativeInput(page).setInputFiles([buffer('a.pdf'), buffer('b.pdf')]);
    await expect(status).toHaveText(/^2 files selected\s*$/);
    await page.getByRole('button', { name: 'Remove a.pdf' }).click();
    await expect(status).toHaveText(/^1 file selected\s*$/);
  });

  test('a long file name is truncated inside the container, the tooltip shows the full name on hover, no horizontal overflow', async ({ page }) => {
    await gotoStory(page, STORY('states'));
    const long = page.getByText(/^scanned-supplier-invoice/);
    await expect(long).toBeVisible();
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    const truncated = await long.evaluate((el) => el.closest('span')!.scrollWidth > el.closest('span')!.clientWidth);
    expect(truncated).toBe(true);
    await long.hover();
    await expect(page.getByRole('tooltip')).toContainText('scanned-supplier-invoice');
  });
});

test.describe('blocked and disabled', () => {
  test('locked: click, Enter, Space, the Field label and a drop open nothing and change nothing; no Remove buttons', async ({ page }) => {
    await gotoStory(page, STORY('locked-with-file'));
    const button = CHOOSE(page);
    await expect(button).toBeEnabled();
    await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
    await expect(button).toHaveAccessibleDescription(/closed after approval/);
    let opened = 0;
    page.on('filechooser', () => opened++);
    await button.click();
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.locator('label', { hasText: 'Invoice attachments' }).click();
    await drop(page, dropZone(page), [{ name: 'new.pdf' }]);
    await page.waitForTimeout(300);
    expect(opened).toBe(0);
    await expect(items(page)).toHaveCount(1);
    await expect(items(page)).toContainText('invoice-2026-001.pdf');
    await expect(changeCalls(page)).toHaveText('0');
    await expect(rejectCalls(page)).toHaveText('0');
  });

  test('locked: a drag over the area does not light it', async ({ page }) => {
    await gotoStory(page, STORY('locked-with-file'));
    const dt = await dataTransfer(page, [{ name: 'a.pdf' }]);
    await dropZone(page).dispatchEvent('dragenter', { dataTransfer: dt });
    await dropZone(page).dispatchEvent('dragover', { dataTransfer: dt });
    await expect(dropZone(page)).not.toHaveAttribute('data-dragging');
  });

  test('disabled: the button is out of the tab order and the drop is ignored', async ({ page }) => {
    await gotoStory(page, STORY('playground'), 'fieldState:disabled');
    await expect(CHOOSE(page)).toBeDisabled();
    await drop(page, dropZone(page), [{ name: 'a.pdf' }]);
    await expect(items(page)).toHaveCount(0);
    await expect(changeCalls(page)).toHaveText('0');
  });
});

test.describe('layout, focus ring and accessibility', () => {
  test('the area keeps its size while dragging and when the first file is added; the button does not move', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    const area = dropZone(page);
    const before = (await area.boundingBox())!;
    const buttonBefore = (await CHOOSE(page).boundingBox())!;
    const dt = await dataTransfer(page, [{ name: 'a.pdf' }]);
    await area.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(area).toHaveAttribute('data-dragging', 'true');
    const dragging = (await area.boundingBox())!;
    expect(dragging).toEqual(before);
    await area.dispatchEvent('dragleave', { dataTransfer: dt });
    await nativeInput(page).setInputFiles(buffer('a.pdf'));
    await expect(items(page)).toHaveCount(1);
    expect((await CHOOSE(page).boundingBox())!).toEqual(buttonBefore);
  });

  test('the button shows a focus ring and has a touch target of at least 24px', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    await page.keyboard.press('Tab');
    await expect(CHOOSE(page)).toBeFocused();
    await expectFocusRingVisible(CHOOSE(page));
    await nativeInput(page).setInputFiles(buffer('a.pdf'));
    const remove = page.getByRole('button', { name: 'Remove a.pdf' });
    const box = (await remove.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  });

  test('mobile width: no horizontal overflow with long names', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, STORY('states'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
  });

  test('no axe violations: empty, with files, invalid and required', async ({ page }) => {
    await gotoStory(page, STORY('playground'), 'invalid:true;required:true');
    await nativeInput(page).setInputFiles([buffer('a.pdf'), buffer('b.pdf')]);
    await expect(items(page)).toHaveCount(2);
    await expectNoA11yViolations(page);
  });

  test('no axe violations in the states story and in the Field states', async ({ page }) => {
    for (const name of ['states', 'field-states', 'locked-with-file']) {
      await gotoStory(page, STORY(name));
      await expectNoA11yViolations(page);
    }
  });
});
