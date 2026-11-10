import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass } from './helpers/story';

// Input docs page (#407): the stories of `Forms/Input` against the real keyboard and clipboard.
test.describe('stories', () => {
  for (const id of ['playground', 'inside-field', 'forced-and-locked', 'controlled-vs-uncontrolled', 'looks']) {
    test(`the play function of ${id} passes, no axe violation`, async ({ page }) => {
      await expectPlayToPass(page, `forms-input--${id}`);
      await expectNoA11yViolations(page);
    });
  }

  test('looks: no horizontal overflow', async ({ page }) => {
    await expectPlayToPass(page, 'forms-input--looks');
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
  });
});

test.describe('Manual story: real keyboard', () => {
  test('typing, then select-all + Backspace, leaves the input empty', async ({ page }) => {
    await page.goto('/iframe.html?id=forms-input--manual&viewMode=story');
    const input = page.getByRole('textbox', { name: 'Company name' });
    await input.click();
    await page.keyboard.type('Acme');
    await expect(input).toHaveValue('Acme');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue('');
  });

  test('size sm is shorter than size md', async ({ page }) => {
    await expectPlayToPass(page, 'forms-input--looks');
    const md = await page.getByRole('textbox', { name: 'Size md (default)' }).evaluate((el) => el.getBoundingClientRect().height);
    const sm = await page.getByRole('textbox', { name: 'Size sm' }).evaluate((el) => el.getBoundingClientRect().height);
    expect(sm).toBeLessThan(md);
  });
});

test.describe('forced / locked: the value cannot change', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('typing, paste and cut leave a forced and a locked input unchanged', async ({ page }) => {
    await expectPlayToPass(page, 'forms-input--forced-and-locked');
    for (const [name, value] of [
      ['Discount', '10%'],
      ['Customer code', 'C-0042'],
    ] as const) {
      const input = page.getByRole('textbox', { name });
      await input.focus();
      await page.keyboard.type('typed');
      await page.keyboard.press('Backspace');
      await page.evaluate(() => navigator.clipboard.writeText('pasted'));
      await page.keyboard.press('Control+V');
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Control+X');
      await expect(input).toHaveValue(value);
    }
  });
});

test.describe('Utilities page stories', () => {
  for (const id of ['class-names', 'composing-refs']) {
    test(`the play function of ${id} passes, no axe violation`, async ({ page }) => {
      await expectPlayToPass(page, `foundations-utilities--${id}`);
      await expectNoA11yViolations(page);
    });
  }
});

test.describe('sections added to existing pages', () => {
  for (const id of [
    'forms-combobox--headless-hook',
    'forms-field--hook-toggle-enabled',
    'forms-field--render-prop-locked',
    'overlays-tooltip--toolbar',
    'pro-changesummary--inferred-labels',
    'pro-patterns-form-rebase--pure-merge',
  ]) {
    test(`the play function of ${id} passes`, async ({ page }) => {
      await expectPlayToPass(page, id);
    });
  }
});
