// @vitest-environment node
// Large datasets stay cheap enough for a 100k-row story. Each measurement imports a fresh copy of the
// module graph, so nothing is cached yet (the employee and supplier reference pools are built inside
// the measured call too). Budget: 500 ms per call on the CI runner (ticket #513); see the PR for the
// numbers measured when the budget was set.
const BUDGET_MS = 500;

async function timeFresh(load: () => Promise<(n: number) => readonly unknown[]>, n: number): Promise<number> {
  vi.resetModules();
  const make = await load();
  const start = performance.now();
  const rows = make(n);
  const elapsed = performance.now() - start;
  expect(rows).toHaveLength(n);
  return elapsed;
}

describe('demo-data performance', () => {
  it(`makeProducts(100000) runs in under ${BUDGET_MS} ms`, async () => {
    const elapsed = await timeFresh(async () => (await import('./products')).makeProducts, 100_000);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it(`makeCustomers(100000) runs in under ${BUDGET_MS} ms`, async () => {
    const elapsed = await timeFresh(async () => (await import('./customers')).makeCustomers, 100_000);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
