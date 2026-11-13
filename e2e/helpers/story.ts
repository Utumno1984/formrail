import { appendFileSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

interface StorybookIndex {
  entries?: Record<string, { id: string; type?: string }>;
}

/**
 * Opens a story and waits for its `play` function (Storybook "Interactions") to finish, failing
 * if it threw. A failing play does not show Storybook's error display, so `gotoStory` alone would
 * let a broken interaction pass. `args` is Storybook's URL syntax, e.g. `mono:!false;size:lg`.
 */
export async function expectPlayToPass(page: Page, storyId: string, args?: string): Promise<void> {
  const errors = await openAfterPlay(page, storyId, args);
  if (errors.length > 0) {
    throw new Error(
      `expectPlayToPass: the play function of "${storyId}" failed:\n${errors.map((e) => `${e.event}: ${e.raw}`).join('\n')}`,
    );
  }
}

/**
 * For a story whose play FAILS BY DESIGN under the args the test needs (e.g. it asserts a layout the
 * args switch off) but still drives the controls the test is about to use: opens it, waits for the
 * play to end and checks that it failed with the EXPECTED error: `expected` is matched against the
 * error MESSAGE only (never the serialized payload, which also holds the stack and a DOM dump that
 * would match almost any pattern), not with any error.
 */
export async function expectPlayToFail(
  page: Page,
  storyId: string,
  args: string | undefined,
  expected: RegExp,
): Promise<void> {
  const errors = await openAfterPlay(page, storyId, args);
  if (errors.length === 0) {
    throw new Error(`expectPlayToFail: the play function of "${storyId}" was expected to fail but passed`);
  }
  if (!errors.some((e) => expected.test(e.message))) {
    throw new Error(
      `expectPlayToFail: "${storyId}" failed with an unexpected error (wanted ${expected}):\n${errors.map((e) => `${e.event}: ${e.message}`).join('\n')}`,
    );
  }
}

const recorderInstalled = new WeakSet<Page>();

/** Opens the story, waits for its play to end and returns the failures it recorded. */
interface PlayError {
  event: string;
  message: string;
  raw: string;
}

async function openAfterPlay(page: Page, storyId: string, args?: string): Promise<PlayError[]> {
  await installPlayErrorRecorder(page);
  await openStory(page, storyId, args);
  await waitForPlayEnd(page);
  const recorded = await page.evaluate(() => (window as unknown as { __ropPlayErrors?: string[] }).__ropPlayErrors ?? []);
  return recorded.map((r) => JSON.parse(r) as PlayError);
}

async function installPlayErrorRecorder(page: Page): Promise<void> {
  // One init script per page, however many stories the test opens (repeated calls would register
  // the channel listeners several times and report every failure more than once).
  if (recorderInstalled.has(page)) return;
  recorderInstalled.add(page);
  // The channel is created by the preview after load, before the play function runs: subscribe to
  // the failure events as soon as it exists and record them for the check below.
  await page.addInitScript(() => {
    const w = window as unknown as {
      __STORYBOOK_ADDONS_CHANNEL__?: { on: (event: string, cb: (payload: unknown) => void) => void };
      __ropPlayErrors?: string[];
    };
    w.__ropPlayErrors = [];
    const timer = setInterval(() => {
      const channel = w.__STORYBOOK_ADDONS_CHANNEL__;
      if (!channel) return;
      clearInterval(timer);
      for (const event of ['playFunctionThrewException', 'storyThrewException', 'storyErrored']) {
        channel.on(event, (payload) => {
          const message = (payload as { message?: unknown } | null)?.message;
          w.__ropPlayErrors?.push(
            JSON.stringify({ event, message: typeof message === 'string' ? message : String(payload), raw: JSON.stringify(payload) }),
          );
        });
      }
    }, 1);
  });
}

/**
 * Waits until the story's play function has ended, whatever its outcome (the render phase is
 * terminal: played / completed / finished / errored / aborted). Use it, after `gotoStory`, for a
 * story whose play cannot pass under the args the test needs (so `expectPlayToPass` would fail)
 * but whose play still clicks the controls the test is about to drive.
 */
export async function waitForPlayEnd(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const render = (
        window as unknown as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } }
      ).__STORYBOOK_PREVIEW__?.currentRender;
      const p = render?.phase;
      return !!p && ['played', 'completing', 'completed', 'finished', 'errored', 'aborted'].includes(p);
    },
    undefined,
    { timeout: 10_000 },
  );
}

/**
 * Opens a story in the preview iframe and waits until it has rendered.
 * Throws an explicit error if `storyId` is not listed in `index.json`
 * (otherwise Storybook would render a "story not found" page and tests would pass).
 * `args` overrides the story args (Storybook URL syntax, e.g. `mono:!false`).
 */
export async function gotoStory(page: Page, storyId: string, args?: string): Promise<void> {
  await openStory(page, storyId, args);
  // A story WITH a play function is still being driven by it when it first renders: a test that
  // starts now races against the play (same controls, same state; seen in the census below, #480).
  // So when the story has a play, wait for it to END (whatever its outcome: use `expectPlayToPass`
  // to also require that it passed, `expectPlayToFail` when it must fail by design). Stories without
  // a play (`-no-play` fixtures) are not delayed. NB: after a play the story is left in the state the
  // play ended in (or, for a play that failed half-way, wherever it stopped).
  const { hasPlay, phase } = await page.evaluate(() => {
    const render = (
      window as unknown as {
        __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string; story?: { playFunction?: unknown } } };
      }
    ).__STORYBOOK_PREVIEW__?.currentRender;
    return { hasPlay: !!render?.story?.playFunction, phase: render?.phase ?? null };
  });
  if (process.env.ROP_PLAY_CENSUS) recordCensus(storyId, args, hasPlay, phase);
  if (hasPlay) await waitForPlayEnd(page);
}

/**
 * Opt-in census (`ROP_PLAY_CENSUS=<file>`): every `gotoStory` appends one JSON line with the test,
 * the story, whether it has a play function and the render phase when the page had just rendered,
 * BEFORE the wait above (`playing`/`rendering`... = the play was running when the test would have
 * started). Use it to audit the suite or a new spec.
 */
function recordCensus(storyId: string, args: string | undefined, hasPlay: boolean, phase: string | null): void {
  const t = test.info();
  appendFileSync(
    process.env.ROP_PLAY_CENSUS!,
    JSON.stringify({ file: t.file.split('/').pop(), test: t.title, storyId, args: args ?? null, hasPlay, phase }) + '\n',
  );
}

async function openStory(page: Page, storyId: string, args?: string): Promise<void> {
  const res = await page.request.get('/index.json');
  if (!res.ok()) {
    throw new Error(`gotoStory: cannot read /index.json (HTTP ${res.status()})`);
  }
  const index = (await res.json()) as StorybookIndex;
  const entry = index.entries?.[storyId];
  if (!entry || entry.type === 'docs') {
    const known = Object.values(index.entries ?? {})
      .filter((e) => e.type !== 'docs')
      .map((e) => e.id);
    throw new Error(
      `gotoStory: story "${storyId}" not found in index.json. Known stories: ${known.join(', ') || '(none)'}`,
    );
  }

  await page.goto(
    `/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story${args ? `&args=${encodeURIComponent(args)}` : ''}`,
  );
  await page.waitForSelector('body.sb-show-main, body.sb-show-errordisplay', { state: 'attached' });
  // Wait for "root has children OR error display": late render errors surface here.
  const rendered = await page
    .waitForFunction(
      () => {
        if (document.body.classList.contains('sb-show-errordisplay')) return true;
        const root = document.querySelector('#storybook-root');
        return !!root && root.childElementCount > 0;
      },
      undefined,
      { timeout: 5_000 },
    )
    .then(() => true)
    .catch(() => false);
  if ((await page.locator('body.sb-show-errordisplay').count()) > 0) {
    const message = (await page.locator('#error-message').textContent()) ?? '';
    throw new Error(`gotoStory: story "${storyId}" failed to render: ${message}`);
  }
  if (!rendered) {
    throw new Error(
      `gotoStory: story "${storyId}" rendered nothing in #storybook-root (null, or portal-only output)`,
    );
  }
}
