// @vitest-environment node
// The contract every generator of the demo universe shares (see index.ts).
import { DEMO_TODAY, isoToDayNumber } from './dates';
import {
  CUSTOMER_STATUS_LABEL,
  EMPLOYEE_STATUS_LABEL,
  getCustomer,
  getEmployee,
  getProduct,
  getSupplier,
  makeCustomers,
  makeEmployees,
  makeProducts,
  makeSuppliers,
  PRODUCT_STATUS_LABEL,
  SUPPLIER_STATUS_LABEL,
} from './index';

interface Row {
  readonly id: string;
  readonly status: string;
}

interface Case {
  name: string;
  make: (n: number) => readonly Row[];
  get: (id: string) => Row | undefined;
  modulePath: string;
  exportName: string;
  idPattern: RegExp;
  code: (row: Row) => string;
  codePattern: RegExp;
  statuses: readonly string[];
  dateKeys: readonly string[];
  /** Rows within which every status appears. */
  statusWindow: number;
}

const CASES: Case[] = [
  {
    name: 'makeEmployees',
    make: makeEmployees,
    get: getEmployee,
    modulePath: './employees',
    exportName: 'makeEmployees',
    idPattern: /^emp-[1-9]\d*$/,
    code: (row) => (row as ReturnType<typeof makeEmployees>[number]).code,
    codePattern: /^E-\d{4,}$/,
    statuses: Object.keys(EMPLOYEE_STATUS_LABEL),
    dateKeys: ['hireDate', 'endDate'],
    // The first rows are the CEO, the heads and their managers, all active: leave and departures
    // show from the team level on, within the reference pool.
    statusWindow: 400,
  },
  {
    name: 'makeCustomers',
    make: makeCustomers,
    get: getCustomer,
    modulePath: './customers',
    exportName: 'makeCustomers',
    idPattern: /^cus-[1-9]\d*$/,
    code: (row) => (row as ReturnType<typeof makeCustomers>[number]).code,
    codePattern: /^C-\d{5,}$/,
    statuses: Object.keys(CUSTOMER_STATUS_LABEL),
    dateKeys: ['createdOn'],
    statusWindow: 50,
  },
  {
    name: 'makeSuppliers',
    make: makeSuppliers,
    get: getSupplier,
    modulePath: './suppliers',
    exportName: 'makeSuppliers',
    idPattern: /^sup-[1-9]\d*$/,
    code: (row) => (row as ReturnType<typeof makeSuppliers>[number]).code,
    codePattern: /^V-\d{5,}$/,
    statuses: Object.keys(SUPPLIER_STATUS_LABEL),
    dateKeys: ['createdOn'],
    statusWindow: 50,
  },
  {
    name: 'makeProducts',
    make: makeProducts,
    get: getProduct,
    modulePath: './products',
    exportName: 'makeProducts',
    idPattern: /^prd-[1-9]\d*$/,
    code: (row) => (row as ReturnType<typeof makeProducts>[number]).sku,
    codePattern: /^[A-Z]{3}-\d{5,}$/,
    statuses: Object.keys(PRODUCT_STATUS_LABEL),
    dateKeys: ['createdOn'],
    statusWindow: 50,
  },
];

const TODAY = isoToDayNumber(DEMO_TODAY);

/** Every nested object and array of a record is frozen. */
function expectDeepFrozen(value: unknown, path = 'record'): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value), `${path} is frozen`).toBe(true);
  for (const [key, child] of Object.entries(value)) expectDeepFrozen(child, `${path}.${key}`);
}

describe.each(CASES)('$name', (c) => {
  it('returns [] for n = 0 and one record for n = 1', () => {
    expect(c.make(0)).toEqual([]);
    const one = c.make(1);
    expect(one).toHaveLength(1);
    expect(one[0]!.id).toMatch(/-1$/);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3' as unknown as number])('throws on n = %s', (n) => {
    expect(() => c.make(n)).toThrow(RangeError);
  });

  it('returns equal data and the same instance for the same n', () => {
    const first = c.make(50);
    const second = c.make(50);
    expect(second).toBe(first);
    expect(second).toEqual(first);
  });

  it('generates row i independently of n: the first 200 rows of 200 and 5,000 coincide', () => {
    const small = c.make(200);
    const large = c.make(5000);
    expect(large).not.toBe(small);
    expect(large.slice(0, 200)).toEqual(small);
  });

  it('generates row i independently of the call order (fresh module, row 150 first)', async () => {
    vi.resetModules();
    const fresh = (await import(c.modulePath)) as Record<string, (n: number) => readonly Row[]>;
    const getName = `get${c.exportName.slice('make'.length, -1)}`;
    const getById = fresh[getName] as unknown as (id: string) => Row | undefined;
    const lateFirst = getById(c.make(200)[150]!.id);
    expect(lateFirst).toEqual(c.make(200)[150]);
    expect(fresh[c.exportName]!(200)).toEqual(c.make(200));
  });

  // The row cache makes any same-module comparison between two n tautological (the rows of the small
  // n ARE the rows of the large one). Two fresh module graphs, each built from scratch with one n,
  // in both orders, catch a row that depends on n or on module state (QA of PR #536).
  it.each([
    ['large n first', [5000, 200]],
    ['small n first', [200, 5000]],
  ] as const)('the first 200 rows do not depend on n, in fresh modules (%s)', async (_, [first, second]) => {
    const load = async () => {
      vi.resetModules();
      return (await import(c.modulePath)) as Record<string, (n: number) => readonly Row[]>;
    };
    const a = await load();
    const rowsA = a[c.exportName]!(first).slice(0, 200);
    const b = await load();
    const rowsB = b[c.exportName]!(second).slice(0, 200);
    expect(rowsA).toHaveLength(200);
    expect(JSON.stringify(rowsA)).toBe(JSON.stringify(rowsB));
  });

  it('does not let a caller alter the cache: arrays and records are deeply frozen', () => {
    const list = c.make(30);
    expect(Object.isFrozen(list)).toBe(true);
    for (const row of list) expectDeepFrozen(row);
    const snapshot = structuredClone(list);
    expect(() => (list as Row[]).push(list[0]!)).toThrow(TypeError);
    expect(() => {
      (list[0] as { status: string }).status = 'tampered';
    }).toThrow(TypeError);
    expect(c.make(30)).toEqual(snapshot);
    // Two different n never share an array.
    expect(c.make(31)).not.toBe(c.make(30));
  });

  it('has stable unique ids, readable unique codes, a typed status and ISO dates before DEMO_TODAY', () => {
    const rows = c.make(5000);
    const ids = new Set<string>();
    const codes = new Set<string>();
    const problems: string[] = [];
    const prefix = rows[0]!.id.split('-')[0];
    rows.forEach((row, index) => {
      if (!c.idPattern.test(row.id) || row.id !== `${prefix}-${index + 1}`) problems.push(`${index}: id ${row.id}`);
      if (!c.codePattern.test(c.code(row))) problems.push(`${row.id}: code ${c.code(row)}`);
      if (!c.statuses.includes(row.status)) problems.push(`${row.id}: status ${row.status}`);
      ids.add(row.id);
      codes.add(c.code(row));
      for (const key of c.dateKeys) {
        const value = (row as unknown as Record<string, string | null>)[key];
        if (value === null && key === 'endDate') continue;
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isoToDayNumber(value) > TODAY) problems.push(`${row.id}: ${key} ${value}`);
      }
    });
    expect(problems).toEqual([]);
    expect(ids.size).toBe(rows.length);
    expect(codes.size).toBe(rows.length);
  });

  it('shows every status within the first rows (small stories show every case)', () => {
    expect(new Set(c.make(c.statusWindow).map((row) => row.status))).toEqual(new Set(c.statuses));
  });

  it('resolves ids to the same records, and malformed ids to undefined', () => {
    const rows = c.make(100);
    for (const row of rows) expect(c.get(row.id)).toBe(row);
    for (const bad of ['', 'x-1', `${rows[0]!.id.split('-')[0]}-0`, `${rows[0]!.id.split('-')[0]}-01`, `${rows[0]!.id.split('-')[0]}-1.5`]) {
      expect(c.get(bad)).toBeUndefined();
    }
  });
});
