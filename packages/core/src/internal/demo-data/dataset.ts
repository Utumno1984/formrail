// The shared machinery of every demo dataset: row-by-index generation, a cache per `n`, and frozen
// records, so the same call always returns the same instance and nothing a caller does can alter it.

/**
 * Records of one domain reference the records of another only among the **first** `pool` rows of
 * that domain (account managers among the first employees, preferred suppliers among the first
 * suppliers, ...). So `makeEmployees(DEMO_REFERENCE_POOL.employees)` resolves every `accountManagerId`
 * of `makeCustomers(n)` whatever `n` is, a story can load a small, complete set of related records,
 * and rows of a larger `n` repeat references deterministically. `getEmployee(id)` & co. resolve any id.
 * `customers` and `products` are the pools the transactional documents (orders, invoices, cases) use.
 */
export const DEMO_REFERENCE_POOL = Object.freeze({
  employees: 400,
  customers: 1000,
  suppliers: 200,
  products: 1000,
});

/** Throws unless `n` is a non-negative integer (a silent `[]` would hide the bug). */
export function assertCount(n: number, name: string): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${name}: expected a non-negative integer count, got ${String(n)}`);
  }
}

/** A list of `T` generated row by row: row `i` is a pure function of `i`. */
export interface Dataset<T> {
  /**
   * The first `n` rows, as a frozen array of frozen records. The same `n` returns the same array;
   * different `n` return different arrays that share the (immutable) records.
   */
  make(n: number): readonly T[];
  /** Row `index` (0-based), whatever `n` other calls asked for. */
  at(index: number): T;
}

/**
 * Builds a dataset from a row factory. The factory must return a record that is already deeply
 * frozen (each generator freezes its nested objects as it builds them: cheaper than walking them).
 */
export function createDataset<T>(name: string, makeRow: (index: number) => T): Dataset<T> {
  const rows: T[] = [];
  const lists = new Map<number, readonly T[]>();
  const at = (index: number): T => {
    assertCount(index, `${name} (row index)`);
    let row = rows[index];
    if (row === undefined) {
      row = makeRow(index);
      rows[index] = row;
    }
    return row;
  };
  const make = (n: number): readonly T[] => {
    assertCount(n, name);
    let list = lists.get(n);
    if (!list) {
      const out = new Array<T>(n);
      for (let i = 0; i < n; i++) out[i] = at(i);
      list = Object.freeze(out);
      lists.set(n, list);
    }
    return list;
  };
  return { make, at };
}

/** The 0-based index of an id like `cus-12` (`prefix` is `cus-`), or `-1` when it is not one. */
export function indexFromId(id: string, prefix: string): number {
  if (typeof id !== 'string' || !id.startsWith(prefix)) return -1;
  const digits = id.slice(prefix.length);
  if (!/^[1-9]\d*$/.test(digits)) return -1;
  const index = Number(digits) - 1;
  return Number.isSafeInteger(index) ? index : -1;
}
