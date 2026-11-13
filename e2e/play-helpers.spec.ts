import { expect, test } from '@playwright/test';
import { expectPlayToFail, expectPlayToPass } from './helpers/story';

// Behaviour of the play helpers themselves (#480). OpenerRemoved with `withFallback:!false` is a play
// that fails by design: it expects the Fallback button to get the focus.
const FAILS = 'internal-returnfocus--opener-removed';
const FAILS_ARGS = 'withFallback:!false';
const PASSES = 'internal-returnfocus--from-button';

test.describe('expectPlayToFail / expectPlayToPass', () => {
  test('the expected failure is accepted (matched on the error message)', async ({ page }) => {
    await expectPlayToFail(page, FAILS, FAILS_ARGS, /^expect\(element\)\.toHaveFocus\(\)[\s\S]*Fallback/);
  });

  test('an anchored pattern for another assertion is NOT accepted, although the DOM dump in the message mentions Fallback', async ({
    page,
  }) => {
    await expect(expectPlayToFail(page, FAILS, FAILS_ARGS, /^expect\(element\)\.toBeVisible\(\)[\s\S]*Fallback/)).rejects.toThrow(
      /unexpected error/,
    );
  });

  test('an unrelated error message is NOT accepted', async ({ page }) => {
    await expect(expectPlayToFail(page, FAILS, FAILS_ARGS, /^unrelated boom/)).rejects.toThrow(/unexpected error/);
  });

  test('a play that passes is NOT accepted as an expected failure', async ({ page }) => {
    await expect(expectPlayToFail(page, PASSES, undefined, /./)).rejects.toThrow(/expected to fail but passed/);
  });

  test('expectPlayToPass reports a failing play with its message', async ({ page }) => {
    await expect(expectPlayToPass(page, FAILS, FAILS_ARGS)).rejects.toThrow(/play function of .* failed[\s\S]*toHaveFocus/);
  });

  test('several helper calls on one page do not duplicate the recorded errors', async ({ page }) => {
    await expect(expectPlayToPass(page, FAILS, FAILS_ARGS)).rejects.toThrow();
    await expect(expectPlayToPass(page, FAILS, FAILS_ARGS)).rejects.toThrow();
    const recorded = await page.evaluate(() => (window as unknown as { __ropPlayErrors: string[] }).__ropPlayErrors);
    expect(recorded).toHaveLength(1);
  });
});
