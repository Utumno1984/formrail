// Ticket #424, invariant of the "No value rule": with id keys that `Object.is` always matches (primitive ids, no
// -0, every item with an id) and without `isEqual`, "no entry and no reorder" holds if and only if the form is
// not dirty, with core's own equality (`deepEqual`, imported only here: the engine never imports the core).
import { deepEqual } from '../../../core/src/object-page/equal';
import { computeChangeSummaryResult } from './compute-change-summary';

type Loose = Record<string, unknown>;

const row = (id: number, price: number, taxes: string[] = []) => ({ id, price, taxes: taxes.map((code) => ({ code, rate: 22 })) });

// Fresh objects per call: equal pairs never share a reference, so `===` settles nothing.
const ROWS: Record<string, () => unknown[]> = {
  empty: () => [],
  '1': () => [row(1, 10)],
  '1 2': () => [row(1, 10), row(2, 20)],
  '2 1': () => [row(2, 20), row(1, 10)],
  '1 2*': () => [row(1, 10), row(2, 21)],
  '2* 1': () => [row(2, 21), row(1, 10)],
  '1 2 3': () => [row(1, 10), row(2, 20), row(3, 30)],
  '3 1 2': () => [row(3, 30), row(1, 10), row(2, 20)],
  '1 3': () => [row(1, 10), row(3, 30)],
  '3 1': () => [row(3, 30), row(1, 10)],
  '1(ab) 2': () => [row(1, 10, ['a', 'b']), row(2, 20)],
  '1(ba) 2': () => [row(1, 10, ['b', 'a']), row(2, 20)],
  '2 1(ba)': () => [row(2, 20), row(1, 10, ['b', 'a'])],
};

// `grid` has no id key (a block); the arrays inside its items do.
const GRIDS: Record<string, () => unknown> = {
  absent: () => undefined,
  '[1 2]': () => [{ lines: [row(1, 10), row(2, 20)] }],
  '[2 1]': () => [{ lines: [row(2, 20), row(1, 10)] }],
  '[2 1] []': () => [{ lines: [row(2, 20), row(1, 10)] }, { lines: [] }],
  '[1 2] []': () => [{ lines: [row(1, 10), row(2, 20)] }, { lines: [] }],
};

const CORPUS = Object.entries(ROWS).flatMap(([rowsName, rows]) =>
  Object.entries(GRIDS).map(([gridName, grid]) => ({
    name: `rows ${rowsName}, grid ${gridName}`,
    make: (): Loose => {
      const value: Loose = { lineItems: rows() };
      const g = grid();
      if (g !== undefined) value.grid = g;
      return value;
    },
  })),
);

const ARRAY_ID_KEYS = { lineItems: 'id', 'lineItems.taxes': 'code', 'grid.lines': 'id' };

describe('no entry and no reorder if and only if not dirty (id keys always matched, no isEqual)', () => {
  it(`holds on every pair of a corpus of ${CORPUS.length} values`, () => {
    const wrong: string[] = [];
    let clean = 0;
    let reorderOnly = 0;
    for (const baseline of CORPUS) {
      for (const values of CORPUS) {
        const b = baseline.make();
        const v = values.make();
        const { entries, reorders } = computeChangeSummaryResult({ baseline: b, values: v, arrayIdKeys: ARRAY_ID_KEYS });
        const dirty = !deepEqual(b, v);
        if (!dirty) clean += 1;
        if (entries.length === 0 && reorders.length > 0) reorderOnly += 1;
        if ((entries.length === 0 && reorders.length === 0) !== !dirty) {
          wrong.push(`${baseline.name} -> ${values.name}: dirty ${dirty}, ${entries.length} entries, ${reorders.length} reorders`);
        }
      }
    }
    expect(wrong).toEqual([]);
    // The oracle answers both ways, and the reorders are what keeps the invariant on a part of the corpus.
    expect(clean).toBe(CORPUS.length);
    expect(reorderOnly).toBeGreaterThan(CORPUS.length);
  });

  it('without reorders the invariant would not hold: the entries alone miss the pure reorders', () => {
    const b = { lineItems: ROWS['1 2']!() };
    const v = { lineItems: ROWS['2 1']!() };
    const { entries, reorders } = computeChangeSummaryResult({ baseline: b, values: v, arrayIdKeys: ARRAY_ID_KEYS });
    expect(deepEqual(b, v)).toBe(false);
    expect(entries).toEqual([]);
    expect(reorders).toHaveLength(1);
  });
});
