import { expect, test } from '@playwright/test';
import { expectPlayToFail, expectPlayToPass, gotoStory, readPlayState } from './helpers/story';

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

// gotoStory waits for the play of a story that has one (#480). These tests guard the mechanism
// itself, without depending on whether a given run happens to hit the race: the fixture's play is
// held at a gate that only the test opens, so a gotoStory that does not wait returns while the play
// is still running, however fast the machine is. The phases a passing play can be in once it has
// ended and Storybook has settled (`completing`, the wait for animations, is not one of them):
const SETTLED = ['completed', 'afterEach', 'finished'];
const GATED = 'internal-harness--gated-play';

test.describe('gotoStory waits for the play to end', () => {
  test('it does not return while the play is held at a gate, and returns once the play has ended', async ({ page }) => {
    let returned = false;
    const goto = gotoStory(page, GATED, 'gated:!true').then(() => {
      returned = true;
    });
    // The play has started and is parked: it cannot end until the gate is opened below.
    await expect(page.getByTestId('gated-play')).toHaveAttribute('data-state', 'parked');
    // A gotoStory that did not wait would return right after the render (one page.evaluate later):
    // give it ample time to do so. A waiting one keeps waiting (its own limit is 10 s).
    await Promise.race([goto, new Promise((r) => setTimeout(r, 2_000))]);
    expect(returned, 'gotoStory returned while the play was still running').toBe(false);

    await page.evaluate(() => (window as unknown as { __ropOpenPlayGate: () => void }).__ropOpenPlayGate());
    await goto;
    // Single reads, right as gotoStory returned: the play has ended and the story has settled.
    expect(await page.getByTestId('gated-play').getAttribute('data-state')).toBe('played');
    const { hasPlay, phase } = await readPlayState(page);
    expect(hasPlay).toBe(true);
    expect(SETTLED).toContain(phase);
  });

  test('a story with a known play (Forms/DatePicker, Inside Dialog): the play is detected and has ended when gotoStory returns', async ({
    page,
  }) => {
    await gotoStory(page, 'forms-datepicker--inside-dialog');
    const { hasPlay, phase } = await readPlayState(page);
    expect(hasPlay).toBe(true);
    expect(SETTLED).toContain(phase);
  });

  // A component without any play, and a `-no-play` copy whose play is removed with `play: undefined`.
  for (const id of ['internal-harness--valid', 'floorplans-list-report--url-state-no-play']) {
    test(`${id}: no play is detected`, async ({ page }) => {
      await gotoStory(page, id);
      expect((await readPlayState(page)).hasPlay).toBe(false);
    });
  }

  // If a Storybook upgrade changes the internals the detection reads, it must fail loudly, never
  // answer "no play" (which would silently turn the wait off for the whole suite).
  test('a renamed playFunction makes the detection (and so gotoStory) throw instead of answering "no play"', async ({
    page,
  }) => {
    await gotoStory(page, GATED);
    await page.evaluate(() => {
      const story = (window as unknown as { __STORYBOOK_PREVIEW__: { currentRender: { story: Record<string, unknown> } } })
        .__STORYBOOK_PREVIEW__.currentRender.story;
      story.renamedPlayFunction = story.playFunction;
      delete story.playFunction;
    });
    await expect(readPlayState(page)).rejects.toThrow(/unexpected Storybook preview structure \(currentRender\.story has no "playFunction" key/);
  });

  test('a missing currentRender.story makes the detection throw', async ({ page }) => {
    await gotoStory(page, GATED);
    await page.evaluate(() => {
      (window as unknown as { __STORYBOOK_PREVIEW__: { currentRender: { story?: unknown } } }).__STORYBOOK_PREVIEW__.currentRender.story =
        undefined;
    });
    await expect(readPlayState(page)).rejects.toThrow(/unexpected Storybook preview structure \(currentRender\.story is missing\)/);
  });
});
