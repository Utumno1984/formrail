// @vitest-environment node
// Smoke test on the BUILT bundle (run `npm run build` first; `npm run check` does): what a consumer
// of the published package would import, ESM and CJS.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esm from '../dist/index.js';

type Api = typeof import('../src/index');

const distEsm = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const distCjs = fileURLToPath(new URL('../dist/index.cjs', import.meta.url));
const cjs = createRequire(import.meta.url)(distCjs) as Api;

const baseline = {
  number: 'INV-1',
  note: null as string | null,
  supplier: { name: 'Acme', vatNumber: 'IT111' },
  lineItems: [
    { id: 'a', description: 'Desk', price: 100 },
    { id: 'b', description: 'Chair', price: 50 },
    { id: 'c', description: 'Lamp', price: 20 },
    { id: 'd', description: 'Shelf', price: 70 },
  ] as { id?: string; description: string; price: number }[],
};

const values = {
  ...baseline,
  note: '',
  supplier: { name: 'Acme', vatNumber: 'IT222' },
  lineItems: [
    { id: 'a', description: 'Desk', price: 120 }, // modified
    { id: 'd', description: 'Shelf', price: 70 }, // swapped with c
    { id: 'c', description: 'Lamp', price: 20 },
    { description: 'Cable', price: 5 }, // added, no id yet
    // 'b' removed
  ],
};

const expected = [
  { path: 'note', label: 'Note', kind: 'added' },
  { path: 'supplier.vatNumber', label: 'Supplier > VAT number', kind: 'changed' },
  { path: 'lineItems.0.price', label: 'Line Items > Item 1 > Price', kind: 'changed' },
  { path: 'lineItems.3', label: 'Line Items > Item 4', kind: 'added' },
  { path: 'lineItems.1', label: 'Line Items > Item 2', kind: 'removed' },
];

const run = (api: Api) =>
  api
    .computeChangeSummary({
      values,
      baseline,
      arrayIdKeys: { lineItems: 'id' },
      labels: { 'supplier.vatNumber': 'VAT number' },
    })
    .map(({ path, label, kind }) => ({ path, label, kind }));

describe('built bundle (dist)', () => {
  it('exists', () => {
    expect(existsSync(distEsm)).toBe(true);
    expect(existsSync(distCjs)).toBe(true);
  });

  it('ESM: exact entries on a sample invoice (swapped rows do not appear, null → "" note does)', () => {
    expect(run(esm)).toEqual(expected);
  });

  it('CJS gives the same result as ESM', () => {
    expect(run(cjs)).toEqual(run(esm));
    expect(cjs.inferSegmentLabel('vatID')).toBe('Vat ID');
    expect(typeof cjs.useChangeSummary).toBe('function');
  });

  it('ESM and CJS: computeRebase merges a server version into edited values', () => {
    const incoming = {
      ...baseline,
      supplier: { name: 'Acme Ltd', vatNumber: 'IT333' },
      lineItems: [...baseline.lineItems, { id: 'e', description: 'Mat', price: 15 }],
    };
    const edited = { ...baseline, supplier: { name: 'Acme', vatNumber: 'IT222' } };
    for (const api of [esm, cjs]) {
      const out = api.computeRebase({ baseline, values: edited, incoming, arrayIdKeys: { lineItems: 'id' } });
      expect(out.baseline).toBe(incoming);
      expect(out.values.supplier).toEqual({ name: 'Acme Ltd', vatNumber: 'IT222' });
      expect(out.values.lineItems.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(out.conflicts.map((c) => c.path)).toEqual(['supplier.vatNumber']);
      expect(out.applied.map((e) => e.path)).toEqual(['supplier.name', 'lineItems.4']);
      expect(typeof api.useFormRebase).toBe('function');
    }
  });

  it('contains no runtime licensing / network mechanism', () => {
    for (const file of [distEsm, distCjs]) {
      const code = readFileSync(file, 'utf8');
      expect(code).not.toContain('fetch(');
      expect(code).not.toContain('XMLHttpRequest');
      expect(code).not.toContain('WebSocket');
      const envReads = code.match(/process\.env\.[A-Za-z_$][\w$]*/g) ?? [];
      expect(envReads.length).toBeGreaterThan(0);
      expect(new Set(envReads)).toEqual(new Set(['process.env.NODE_ENV']));
      // No dynamic access either (process.env[...] or a bare process.env object).
      expect(code.match(/process\.env(?!\.NODE_ENV)/g)).toBeNull();
    }
  });
});
