import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

// Ticket #296: test fixtures (stories tagged `internal`) must stay out of the PUBLIC sidebar but remain
// visible locally. This exercises the REAL mechanism end to end (tag -> STORYBOOK_HIDE_INTERNAL inlined
// into the manager bundle -> sidebar.filters.patterns -> rendered DOM), not the text of the CI config:
// a renamed tag, a broken env parsing or a Storybook upgrade that changes the filter API fails here.
// The default build (served as baseURL, built WITHOUT the variable) is the "local" case; a second build
// WITH the variable is made once into a temp dir and served on its own port.

let hiddenPort = 0;
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
// `Internal/*` files are tagged at meta level; `*NoPlay` copies of a documented story one by one.
const INTERNAL_COMPONENT = 'internal-controlstates';
const INTERNAL_STORY = 'internal-controlstates--matrix';
const PUBLIC_COMPONENT = 'floorplans-list-report';

let outDir: string | undefined;
let server: ChildProcess | undefined;

const sidebarItem = (page: Page, id: string) => page.locator(`[data-item-id="${id}"]`);

test.describe('Storybook sidebar: internal stories (#296)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(600_000);
    outDir = mkdtempSync(join(tmpdir(), 'rop-sb-hidden-'));
    execFileSync('npx', ['storybook', 'build', '-o', outDir, '--quiet'], {
      env: { ...process.env, STORYBOOK_HIDE_INTERNAL: '1' },
      stdio: 'pipe',
    });
    // Free port picked by the OS (a fixed one could hit a stale server and serve an old build), and
    // http-server run directly with node: killing an `npx` wrapper would leave the real server alive.
    hiddenPort = await freePort();
    server = spawn(process.execPath, [join(process.cwd(), 'node_modules/http-server/bin/http-server'), outDir, '-p', String(hiddenPort), '-s', '-c-1'], {
      stdio: 'ignore',
    });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://localhost:${hiddenPort}/index.json`)).ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('hidden-internal Storybook server did not start');
  });

  test.afterAll(() => {
    server?.kill();
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  test('without STORYBOOK_HIDE_INTERNAL the internal fixtures are in the sidebar', async ({ page, request }) => {
    const index = (await (await request.get('/index.json')).json()) as { entries: Record<string, { tags?: string[] }> };
    expect(index.entries[INTERNAL_STORY]?.tags).toContain('internal');
    await page.goto(`/?path=/story/${INTERNAL_STORY}`);
    await expect(sidebarItem(page, PUBLIC_COMPONENT)).toBeVisible({ timeout: 30_000 });
    await expect(sidebarItem(page, INTERNAL_COMPONENT)).toBeVisible();
    await expect(sidebarItem(page, INTERNAL_STORY)).toBeVisible();
  });

  test('with STORYBOOK_HIDE_INTERNAL the internal fixtures are gone from the sidebar but still render by id', async ({ page }) => {
    const base = `http://localhost:${hiddenPort}`;
    // A sidebar that loaded (public entry visible) and still lacks the internal ones proves the filter,
    // not a sidebar that never rendered.
    await page.goto(`${base}/?path=/docs/${PUBLIC_COMPONENT}--docs`);
    await expect(sidebarItem(page, PUBLIC_COMPONENT)).toBeVisible({ timeout: 30_000 });
    await expect(sidebarItem(page, INTERNAL_COMPONENT)).toHaveCount(0);
    await expect(sidebarItem(page, INTERNAL_STORY)).toHaveCount(0);
    // Still in the index and renderable: the e2e/visual suites open them by id.
    const index = (await (await page.request.get(`${base}/index.json`)).json()) as { entries: Record<string, unknown> };
    expect(index.entries[INTERNAL_STORY]).toBeDefined();
    await page.goto(`${base}/iframe.html?id=${INTERNAL_STORY}&viewMode=story`);
    await expect(page.locator('#storybook-root')).not.toBeEmpty({ timeout: 15_000 });
  });
});
