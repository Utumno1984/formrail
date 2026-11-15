// @vitest-environment node
// Large datasets stay cheap enough for a 100k-row story. The module is bundled with esbuild and each
// generator is timed in its own fresh Node process: nothing is cached or warmed up yet (the employee
// and supplier reference pools are built inside the measured call too), and the numbers are those of
// plain Node, not of Vitest's module runner (which turns every cross-module call into a property
// read on a namespace object and slows this code several times over). Budget: 500 ms per call on
// the CI runner (ticket #513), 2000 ms on a local machine (see BUDGET_MS); the PR records the numbers
// measured when the budget was set. The file
// runs as its own Vitest project after all the others (see vitest.config.ts), so the parallel test
// files do not steal the CPU from the measurement.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 500 ms is the ticket's budget, enforced where it is defined: on the CI runner (`CI` is set by GitHub
 * Actions). A developer machine running several sessions, worktrees and e2e suites in parallel can be
 * 3-4x slower for reasons unrelated to this code, so locally the declared budget is 2000 ms: it still
 * catches an order-of-magnitude regression without failing on machine load. Not a skip: the test always
 * runs and always prints the measured time.
 */
const CI_BUDGET_MS = 500;
const LOCAL_BUDGET_MS = 2000;
const BUDGET_MS = process.env.CI ? CI_BUDGET_MS : LOCAL_BUDGET_MS;
const DIR = dirname(fileURLToPath(import.meta.url));

let out: string;
let bundle: string;

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'demo-perf-'));
  bundle = join(out, 'demo-data.mjs');
  await build({
    entryPoints: [join(DIR, 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'silent',
  });
});

afterAll(() => rmSync(out, { recursive: true, force: true }));

/** Milliseconds `<generator>(n)` takes in a fresh Node process. */
function timeInFreshProcess(generator: string, n: number): number {
  const script = `
    const data = await import(${JSON.stringify(bundle)});
    const start = performance.now();
    const rows = data.${generator}(${n});
    const elapsed = performance.now() - start;
    if (rows.length !== ${n}) throw new Error('wrong length ' + rows.length);
    console.log(JSON.stringify({ elapsed }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  const { elapsed } = JSON.parse(result.stdout) as { elapsed: number };
  // Printed on purpose: the CI log is where the budget's margin is read (see the PR of #513).
  console.info(`demo-data perf: ${generator}(${n}) took ${elapsed.toFixed(0)} ms (budget ${BUDGET_MS} ms, ${process.env.CI ? 'CI' : 'local'})`);
  return elapsed;
}

describe('demo-data performance (plain Node, fresh process)', () => {
  it(`makeProducts(100000) runs in under ${BUDGET_MS} ms`, () => {
    expect(timeInFreshProcess('makeProducts', 100_000)).toBeLessThan(BUDGET_MS);
  });

  it(`makeCustomers(100000) runs in under ${BUDGET_MS} ms`, () => {
    expect(timeInFreshProcess('makeCustomers', 100_000)).toBeLessThan(BUDGET_MS);
  });

  // Transactional documents (ticket #514): the list needs every total but no line, so these stay cheap too.
  // Invoices bill the `invoiced` orders (about 46% of orders): 100,000 invoices build the totals of 100,000 orders found among ~217,000.
  it(`makeInvoices(100000) runs in under ${BUDGET_MS} ms`, () => {
    expect(timeInFreshProcess('makeInvoices', 100_000)).toBeLessThan(BUDGET_MS);
  });

  it(`makeSalesOrders(100000) runs in under ${BUDGET_MS} ms`, () => {
    expect(timeInFreshProcess('makeSalesOrders', 100_000)).toBeLessThan(BUDGET_MS);
  });

  it(`makePurchaseOrders(100000) runs in under ${BUDGET_MS} ms`, () => {
    expect(timeInFreshProcess('makePurchaseOrders', 100_000)).toBeLessThan(BUDGET_MS);
  });

  it(`makeSupportCases(100000) runs in under ${BUDGET_MS} ms`, () => {
    expect(timeInFreshProcess('makeSupportCases', 100_000)).toBeLessThan(BUDGET_MS);
  });
});
