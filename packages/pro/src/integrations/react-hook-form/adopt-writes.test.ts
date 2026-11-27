// `adoptWrites` (ticket #507, code review round 6): it runs at each value event of the app while a write of the binding
// waits, so its cost must stay linear in the rows of an array, with `arrayIdKeys` too, whether the binding kept the
// rows or changed their shape. Measured by counting the reads of the id key on the rows (deterministic: no timing).
import { adoptWrites } from './use-react-hook-form-binding';

type Line = { id: number; qty: string; note: string };

const ID_KEYS = { lines: 'id' };

/** Rows whose reads of `id` are counted, per tree. */
function counting() {
  const reads = { base: 0, theirs: 0, mine: 0 };
  const row =
    (tree: keyof typeof reads) =>
    (line: Line): Line =>
      new Proxy(line, {
        get(target, key, receiver) {
          if (key === 'id') reads[tree] += 1;
          return Reflect.get(target, key, receiver) as unknown;
        },
      });
  return { base: row('base'), theirs: row('theirs'), mine: row('mine'), reads };
}

/**
 * React Hook Form's values (`base`), the same after a write of the app on row 0 (`theirs`: the other rows keep their
 * identity, as the snapshots do) and the binding's pending write (`mine`: other objects, row 0 changed by the server,
 * plus `extra` rows the binding added).
 */
function trees(n: number, extra: number) {
  const count = counting();
  const line = (i: number): Line => ({ id: i + 1, qty: String(i), note: 'n' });
  const base = Array.from({ length: n }, (_, i) => count.base(line(i)));
  const theirs = base.map((row, i) => (i === 0 ? count.theirs({ ...line(0), qty: 'app' }) : row));
  const mine = Array.from({ length: n + extra }, (_, i) => count.mine(i === 0 ? { ...line(0), note: 'server' } : line(i)));
  return { count, base: { lines: base }, theirs: { lines: theirs }, mine: { lines: mine } };
}

function readsFor(n: number, extra: number): { all: number; mine: number } {
  const { count, base, theirs, mine } = trees(n, extra);
  const merged = adoptWrites(base, theirs, mine, '', ID_KEYS) as { lines: Line[] };
  // The merge itself: the binding's rows, the app's write on the row it was made on.
  expect(merged.lines).toHaveLength(n + extra);
  expect({ ...merged.lines[0] }).toEqual({ id: 1, qty: 'app', note: 'server' });
  expect({ ...merged.lines[n - 1] }).toEqual({ id: n, qty: String(n - 1), note: 'n' });
  const { reads } = count;
  return { all: reads.base + reads.theirs + reads.mine, mine: reads.mine };
}

describe('adoptWrites: linear in the rows of an array with arrayIdKeys (critic round 6)', () => {
  it('the binding kept the rows (same ids, same order): the reads of the id grow linearly with the rows', () => {
    const small = readsFor(400, 0);
    const large = readsFor(800, 0);
    expect(large.all).toBeLessThanOrEqual(2 * small.all + 8);
    expect(large.all).toBeLessThanOrEqual(10 * 800);
    // The id of each row of the binding is read once.
    expect(large.mine).toBeLessThanOrEqual(800 + 8);
  });

  it('the binding kept the rows: they are matched index by index, no index of the ids is built', () => {
    const { base, theirs, mine } = trees(50, 0);
    // Nothing else in the merge uses a Map: a `set` would be the index of the ids.
    const set = vi.spyOn(Map.prototype, 'set');
    try {
      adoptWrites(base, theirs, mine, '', ID_KEYS);
      expect(set).not.toHaveBeenCalled();
    } finally {
      set.mockRestore();
    }
  });

  it('the binding added a row (the rows are matched by id): the reads of the id grow linearly with the rows', () => {
    const small = readsFor(400, 1);
    const large = readsFor(800, 1);
    expect(large.all).toBeLessThanOrEqual(2 * small.all + 8);
    expect(large.all).toBeLessThanOrEqual(10 * 800);
  });

  it('the binding reordered the rows: each row of the binding still gets the write made on its id', () => {
    const { base, theirs } = trees(3, 0);
    const mine = { lines: [{ id: 3, qty: '2', note: 'n' }, { id: 1, qty: '0', note: 'server' }, { id: 2, qty: '1', note: 'n' }] };
    const merged = adoptWrites(base, theirs, mine, '', ID_KEYS) as { lines: Line[] };
    expect(merged.lines.map((line) => ({ ...line }))).toEqual([
      { id: 3, qty: '2', note: 'n' },
      { id: 1, qty: 'app', note: 'server' },
      { id: 2, qty: '1', note: 'n' },
    ]);
  });

  it('two rows of React Hook Form with the same id: the first one is the match, as a lookup from the start finds it', () => {
    const base = { lines: [{ id: 1, qty: 'a', note: 'n' }, { id: 1, qty: 'b', note: 'n' }] };
    const theirs = { lines: [{ id: 1, qty: 'app', note: 'n' }, base.lines[1]] };
    const mine = { lines: [{ id: 1, qty: 'a', note: 'server' }, { id: 2, qty: 'c', note: 'n' }, { id: 3, qty: 'd', note: 'n' }] };
    const merged = adoptWrites(base, theirs, mine, '', ID_KEYS) as { lines: Line[] };
    expect(merged.lines[0]).toEqual({ id: 1, qty: 'app', note: 'server' });
  });
});
