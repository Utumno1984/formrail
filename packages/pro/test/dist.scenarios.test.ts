// @vitest-environment node
// Extra consumer scenarios on the BUILT bundle (ESM + CJS), beyond dist.smoke.test.ts:
// Empty/Absent rules, special types, cycles, duplicate ids, isEqual precedence, labels.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esm from '../dist/index.js';

type Api = typeof import('../src/index');
const cjs = createRequire(import.meta.url)(
  fileURLToPath(new URL('../dist/index.cjs', import.meta.url)),
) as Api;

describe.each([
  ['ESM', esm as unknown as Api],
  ['CJS', cjs],
])('dist scenarios (%s)', (_name, api) => {
  const sum = (o: Parameters<Api['computeChangeSummary']>[0]) =>
    api.computeChangeSummary(o).map((e) => `${e.kind}:${e.path}`);

  it('null/""/undefined/{}/[] against each other produce no entries', () => {
    expect(
      sum({
        values: { a: '', b: undefined, c: {}, d: [], e: null, f: { x: '' } },
        baseline: { a: null, b: '', c: undefined, d: null, e: [], f: undefined },
      }),
    ).toEqual([]);
  });

  it('"" -> "abc" is changed with before "" ; null -> "abc" is added', () => {
    const e = api.computeChangeSummary({ values: { a: 'abc', b: 'x' }, baseline: { a: '', b: null } });
    expect(e.map((x) => [x.kind, x.path, x.before, x.after])).toEqual([
      ['changed', 'a', '', 'abc'],
      ['added', 'b', undefined, 'x'],
    ]);
  });

  it('NaN/-0/equal Dates/invalid Dates are equal; different Dates are changed', () => {
    expect(
      sum({
        values: { n: NaN, z: -0, d: new Date(5), i: new Date(NaN) },
        baseline: { n: NaN, z: 0, d: new Date(5), i: new Date(NaN) },
      }),
    ).toEqual([]);
    expect(sum({ values: { d: new Date(6) }, baseline: { d: new Date(5) } })).toEqual(['changed:d']);
  });

  it('Map/class leaves compare by reference', () => {
    const m = new Map();
    expect(sum({ values: { m }, baseline: { m } })).toEqual([]);
    expect(sum({ values: { m: new Map() }, baseline: { m: new Map() } })).toEqual(['changed:m']);
  });

  it('circular structures terminate, equal and different', () => {
    type N = { x: number; self?: N };
    const a: N = { x: 1 };
    a.self = a;
    const b: N = { x: 1 };
    b.self = b;
    expect(sum({ values: a, baseline: b })).toEqual([]);
    const c: N = { x: 2 };
    c.self = c;
    expect(sum({ values: a, baseline: c })).toEqual(['changed:x']);
  });

  it('values === baseline gives nothing', () => {
    const v = { a: 1 };
    expect(sum({ values: v, baseline: v })).toEqual([]);
  });

  it('reorder-only with ids is empty; without ids is one block entry', () => {
    const b = { l: [{ id: 'a' }, { id: 'b' }] };
    const v = { l: [{ id: 'b' }, { id: 'a' }] };
    expect(sum({ values: v, baseline: b, arrayIdKeys: { l: 'id' } })).toEqual([]);
    expect(sum({ values: v, baseline: b })).toEqual(['changed:l']);
  });

  it('duplicate ids degrade to a block diff, no throw', () => {
    expect(
      sum({
        values: { l: [{ id: 1, x: 1 }, { id: 1, x: 2 }] },
        baseline: { l: [{ id: 1, x: 1 }, { id: 1, x: 3 }] },
        arrayIdKeys: { l: 'id' },
      }),
    ).toEqual(['changed:l']);
  });

  it('id 1 vs "1" are different items (removed + added)', () => {
    expect(
      sum({ values: { l: [{ id: 1 }] }, baseline: { l: [{ id: '1' }] }, arrayIdKeys: { l: 'id' } }).sort(),
    ).toEqual(['added:l.0', 'removed:l.0']);
  });

  it('isEqual takes precedence: true suppresses, false is atomic, undefined falls through', () => {
    expect(
      sum({
        values: { a: 1, b: 2, c: 3 },
        baseline: { a: 2, b: 2, c: 4 },
        isEqual: (_a, _b, p) => (p === 'a' ? true : p === 'b' ? false : undefined),
      }),
    ).toEqual(['changed:b', 'changed:c']);
  });

  it('labels: override one segment, indexes become Item N', () => {
    const [e] = api.computeChangeSummary({
      values: { lineItems: [{ id: 'a', unitPrice: 2 }] },
      baseline: { lineItems: [{ id: 'a', unitPrice: 1 }] },
      arrayIdKeys: { lineItems: 'id' },
      labels: { 'lineItems.unitPrice': 'Price' },
    });
    expect(e?.label).toBe('Line Items > Item 1 > Price');
    expect(api.inferSegmentLabel('HTTPServer')).toBe('HTTP Server');
    expect(api.inferSegmentLabel('vat_number')).toBe('Vat Number');
  });

  it('own "__proto__"/"constructor" keys are ordinary keys and do not pollute', () => {
    const v = JSON.parse('{"__proto__":{"polluted":1},"constructor":2}') as object;
    const r = sum({ values: v, baseline: {} });
    expect(r.sort()).toEqual(['added:__proto__', 'added:constructor']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
