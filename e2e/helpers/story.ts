import type { Page } from '@playwright/test';

interface StorybookIndex {
  entries?: Record<string, { id: string; type?: string }>;
}

/**
 * Opens a story and waits for its `play` function (Storybook "Interactions") to finish, failing
 * if it threw. A failing play does not show Storybook's error display, so `gotoStory` alone would
 * let a broken interaction pass. `args` is Storybook's URL syntax, e.g. `mono:!false;size:lg`.
 */
export async function expectPlayToPass(page: Page, storyId: string, args?: string): Promise<void> {
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
        channel.on(event, (payload) => w.__ropPlayErrors?.push(`${event}: ${JSON.stringify(payload)}`));
      }
    }, 1);
  });
  await gotoStory(page, storyId, args);
  await waitForPlayEnd(page);
  const errors = await page.evaluate(
    () => (window as unknown as { __ropPlayErrors?: string[] }).__ropPlayErrors ?? [],
  );
  if (errors.length > 0) {
    throw new Error(`expectPlayToPass: the play function of "${storyId}" failed:\n${errors.join('\n')}`);
  }
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
      return !!p && ['played', 'completed', 'finished', 'errored', 'aborted'].includes(p);
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
