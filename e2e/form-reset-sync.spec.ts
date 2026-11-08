import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// QA for #292 (shared useFormResetSync): behaviours the per-component specs do not drive.
// Real Chromium: native Reset only changes the DOM, so the next gesture must still be reported.
const kinds = [
  { name: 'Checkbox', story: 'forms-checkbox', role: 'checkbox' as const },
  { name: 'Switch', story: 'forms-switch', role: 'switch' as const },
];

const calls = (page: Page) => page.getByTestId('calls');

for (const { name, story, role } of kinds) {
  test.describe(`${name}: form reset sync (QA #292)`, () => {
    test('controlled: repeated Reset cycles stay aligned, report nothing, keyboard Space still reports', async ({ page }) => {
      await gotoStory(page, `${story}--controlled-in-form`);
      const el = page.getByRole(role);
      await expect(calls(page)).toHaveText('[true,false]');
      await el.click();
      await expect(el).toBeChecked();
      for (let round = 0; round < 3; round++) {
        await page.getByRole('button', { name: 'Reset' }).click();
        // wait out the deferred (setTimeout 0) re-render, then assert the control still shows the state
        await page.waitForTimeout(100);
        await expect(el).toBeChecked();
        await expect(page.getByTestId('state')).toHaveText('true');
        await expect(calls(page)).toHaveText('[true,false,true]');
      }
      await el.focus();
      await page.keyboard.press('Space');
      await expect(el).not.toBeChecked();
      await expect(calls(page)).toHaveText('[true,false,true,false]');
      // Reset while off stays off
      await page.getByRole('button', { name: 'Reset' }).click();
      await page.waitForTimeout(100);
      await expect(el).not.toBeChecked();
      await expect(calls(page)).toHaveText('[true,false,true,false]');
    });

    test('uncontrolled: after Reset the next click toggles and is not swallowed (tracker realigned)', async ({ page }) => {
      await gotoStory(page, `${story}--in-form`);
      const first = page.getByRole(role, { name: 'Newsletter' });
      await expect(first).toBeChecked();
      for (let round = 0; round < 2; round++) {
        await first.click();
        await expect(first).not.toBeChecked();
        await page.getByRole('button', { name: 'Reset' }).click();
        await expect(first).toBeChecked();
        await page.waitForTimeout(100);
        await first.click();
        await expect(first).not.toBeChecked();
        await page.getByRole('button', { name: 'Reset' }).click();
        await expect(first).toBeChecked();
      }
    });
  });
}

test.describe('RadioGroup: shared hook (QA #292)', () => {
  test('uncontrolled in a form: Reset, then clicks on other radios are applied; repeated', async ({ page }) => {
    await gotoStory(page, 'forms-radiogroup--in-form');
    const radio = (n: string) => page.getByRole('radio', { name: n });
    for (let round = 0; round < 2; round++) {
      await radio('Free').click();
      await expect(radio('Free')).toBeChecked();
      await page.getByRole('button', { name: 'Reset' }).click();
      await expect(radio('Team')).toBeChecked();
      await page.waitForTimeout(100);
      await radio('Business').click();
      await expect(radio('Business')).toBeChecked();
      await radio('Team').click();
      await expect(radio('Team')).toBeChecked();
    }
  });
});
