// @vitest-environment node
// Academy (courses, enrolments) and webshop (carts) of the demo universe (ticket #623): the contract
// every generator shares (see index.ts and generators.test.ts) plus the rules of these three domains.
import { DEMO_TODAY, isoToDayNumber } from './dates';
import {
  CART_STATUS_LABEL,
  CART_STATUS_TONE,
  COURSE_CATEGORY_LABEL,
  COURSE_FORMAT_LABEL,
  COURSE_STATUS_LABEL,
  COURSE_STATUS_TONE,
  DEMO_REFERENCE_POOL,
  ENROLMENT_STATUS_LABEL,
  ENROLMENT_STATUS_TONE,
  discountMinor,
  getCart,
  getCourse,
  getCustomer,
  getEmployee,
  getEnrolment,
  getProduct,
  lineTotalMinor,
  makeCarts,
  makeCourses,
  makeCustomers,
  makeEmployees,
  makeEnrolments,
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
  idPrefix: string;
  code: (row: Row) => string;
  codePattern: RegExp;
  statuses: readonly string[];
  dateKeys: readonly string[];
  statusWindow: number;
}

const CASES: Case[] = [
  {
    name: 'makeCourses',
    make: makeCourses,
    get: getCourse,
    modulePath: './courses',
    exportName: 'makeCourses',
    idPrefix: 'crs',
    code: (row) => (row as ReturnType<typeof makeCourses>[number]).code,
    codePattern: /^ACD-\d{5,}$/,
    statuses: Object.keys(COURSE_STATUS_LABEL),
    dateKeys: ['publishedOn'],
    statusWindow: 50,
  },
  {
    name: 'makeEnrolments',
    make: makeEnrolments,
    get: getEnrolment,
    modulePath: './enrolments',
    exportName: 'makeEnrolments',
    idPrefix: 'enr',
    code: (row) => row.id,
    codePattern: /^enr-[1-9]\d*$/,
    statuses: Object.keys(ENROLMENT_STATUS_LABEL),
    dateKeys: ['enrolledOn', 'completedOn'],
    statusWindow: 50,
  },
  {
    name: 'makeCarts',
    make: makeCarts,
    get: getCart,
    modulePath: './carts',
    exportName: 'makeCarts',
    idPrefix: 'cart',
    code: (row) => (row as ReturnType<typeof makeCarts>[number]).number,
    codePattern: /^CART-\d{5,}$/,
    statuses: Object.keys(CART_STATUS_LABEL),
    dateKeys: ['updatedAt'],
    statusWindow: 50,
  },
];

const TODAY = isoToDayNumber(DEMO_TODAY);

function expectDeepFrozen(value: unknown, path = 'record'): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value), `${path} is frozen`).toBe(true);
  for (const [key, child] of Object.entries(value)) expectDeepFrozen(child, `${path}.${key}`);
}

describe.each(CASES)('$name (shared contract)', (c) => {
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
    expect(c.make(50)).toBe(first);
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
    const getById = fresh[`get${c.exportName.slice('make'.length, -1)}`] as unknown as (id: string) => Row | undefined;
    expect(getById(c.make(200)[150]!.id)).toEqual(c.make(200)[150]);
    expect(fresh[c.exportName]!(200)).toEqual(c.make(200));
  });

  it.each([
    ['large n first', [5000, 200]],
    ['small n first', [200, 5000]],
  ] as const)('the first 200 rows do not depend on n, in fresh modules (%s)', async (_, [first, second]) => {
    const load = async () => {
      vi.resetModules();
      return (await import(c.modulePath)) as Record<string, (n: number) => readonly Row[]>;
    };
    const rowsA = (await load())[c.exportName]!(first).slice(0, 200);
    const rowsB = (await load())[c.exportName]!(second).slice(0, 200);
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
    expect(c.make(31)).not.toBe(c.make(30));
  });

  it('has stable unique ids, readable unique codes, a typed status and ISO dates not after DEMO_TODAY', () => {
    const rows = c.make(5000);
    const problems: string[] = [];
    const ids = new Set<string>();
    const codes = new Set<string>();
    rows.forEach((row, index) => {
      if (row.id !== `${c.idPrefix}-${index + 1}`) problems.push(`${index}: id ${row.id}`);
      if (!c.codePattern.test(c.code(row))) problems.push(`${row.id}: code ${c.code(row)}`);
      if (!c.statuses.includes(row.status)) problems.push(`${row.id}: status ${row.status}`);
      ids.add(row.id);
      codes.add(c.code(row));
      for (const key of c.dateKeys) {
        const value = (row as unknown as Record<string, string | null>)[key];
        if (value === null) continue;
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isoToDayNumber(value) > TODAY) problems.push(`${row.id}: ${key} ${value}`);
      }
    });
    expect(problems).toEqual([]);
    expect(ids.size).toBe(rows.length);
    expect(codes.size).toBe(rows.length);
  });

  it('shows every status within the first rows', () => {
    expect(new Set(c.make(c.statusWindow).map((row) => row.status))).toEqual(new Set(c.statuses));
  });

  it('resolves ids to the same records, and malformed ids to undefined', () => {
    for (const row of c.make(100)) expect(c.get(row.id)).toBe(row);
    for (const bad of ['', 'x-1', `${c.idPrefix}-0`, `${c.idPrefix}-01`, `${c.idPrefix}-1.5`]) expect(c.get(bad)).toBeUndefined();
  });
});

describe('labels and tones', () => {
  it('cover every status, category and format', () => {
    expect(Object.keys(COURSE_STATUS_TONE).sort()).toEqual(Object.keys(COURSE_STATUS_LABEL).sort());
    expect(Object.keys(ENROLMENT_STATUS_TONE).sort()).toEqual(Object.keys(ENROLMENT_STATUS_LABEL).sort());
    expect(Object.keys(CART_STATUS_TONE).sort()).toEqual(Object.keys(CART_STATUS_LABEL).sort());
    expect(Object.keys(COURSE_CATEGORY_LABEL).sort()).toEqual(['compliance', 'product-training', 'safety', 'soft-skills']);
    expect(Object.keys(COURSE_FORMAT_LABEL).sort()).toEqual(['blended', 'live', 'self-paced']);
  });
});

describe('courses', () => {
  const rows = makeCourses(5000);

  it('have 2 to 12 uniquely identified modules whose minutes add up to the duration', () => {
    for (const course of rows) {
      expect(course.modules.length).toBeGreaterThanOrEqual(2);
      expect(course.modules.length).toBeLessThanOrEqual(12);
      expect(course.modules.map((m) => m.id)).toEqual(course.modules.map((_, k) => `${course.id}-mod-${k + 1}`));
      expect(course.modules.reduce((sum, m) => sum + m.minutes, 0)).toBe(course.durationMinutes);
      for (const m of course.modules) expect(m.minutes).toBeGreaterThan(0);
    }
  });

  it('use every category and format, with an instructor among the first active employees', () => {
    expect(new Set(rows.map((c) => c.category))).toEqual(new Set(Object.keys(COURSE_CATEGORY_LABEL)));
    expect(new Set(rows.map((c) => c.format))).toEqual(new Set(Object.keys(COURSE_FORMAT_LABEL)));
    const pool = new Map(makeEmployees(DEMO_REFERENCE_POOL.employees).map((e) => [e.id, e]));
    for (const course of rows) expect(pool.get(course.instructorId)?.status, course.id).toBe('active');
  });

  it('have a draft without publication date, any other with one', () => {
    for (const course of rows) expect(course.publishedOn === null, course.id).toBe(course.status === 'draft');
    expect(rows.some((c) => c.status === 'draft')).toBe(true);
  });

  it('have a price in every currency (whole yen), above zero', () => {
    for (const course of rows.slice(0, 500)) {
      expect(Object.keys(course.listPriceMinor)).toEqual(['EUR', 'USD', 'GBP', 'JPY']);
      for (const value of Object.values(course.listPriceMinor)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('include long titles (over 60 characters) for truncation, among them module titles', () => {
    expect(rows.filter((c) => c.title.length > 60).length).toBeGreaterThan(20);
    expect(rows.some((c) => c.modules.some((m) => m.title.length > 60))).toBe(true);
    // And ordinary ones: not every title is long.
    expect(rows.filter((c) => c.title.length <= 60).length).toBeGreaterThan(rows.length / 2);
  });
});

describe('enrolments', () => {
  const rows = makeEnrolments(5000);
  const courses = makeCourses(DEMO_REFERENCE_POOL.courses);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  it('keep state, progress, completion date and score coherent', () => {
    const problems: string[] = [];
    for (const e of rows) {
      const inRange = Number.isInteger(e.progressPercent) && e.progressPercent >= 0 && e.progressPercent <= 100;
      if (!inRange) problems.push(`${e.id}: progress ${e.progressPercent}`);
      if (e.status === 'completed' && (e.progressPercent !== 100 || e.completedOn === null || e.score === null)) problems.push(`${e.id}: completed`);
      if (e.status === 'enrolled' && e.progressPercent !== 0) problems.push(`${e.id}: enrolled at ${e.progressPercent}`);
      if (e.status === 'in-progress' && (e.progressPercent < 1 || e.progressPercent > 99)) problems.push(`${e.id}: in-progress at ${e.progressPercent}`);
      if (e.status !== 'completed' && (e.completedOn !== null || e.score !== null)) problems.push(`${e.id}: ${e.status} with a result`);
      if (e.status === 'withdrawn' && e.progressPercent === 100) problems.push(`${e.id}: withdrawn at 100`);
      if (e.completedOn !== null && e.completedOn < e.enrolledOn) problems.push(`${e.id}: completed before enrolling`);
      if (e.score !== null && (e.score < 0 || e.score > 100)) problems.push(`${e.id}: score ${e.score}`);
    }
    expect(problems).toEqual([]);
  });

  it('include a withdrawn enrolment with partial progress and no completion date', () => {
    expect(rows.some((e) => e.status === 'withdrawn' && e.progressPercent > 0 && e.progressPercent < 100 && e.completedOn === null)).toBe(true);
  });

  it('point at published or retired courses within the reference pool, enrolled after their publication', () => {
    const problems: string[] = [];
    for (const e of rows) {
      const course = courseById.get(e.courseId);
      if (!course || course.status === 'draft') problems.push(`${e.id}: course ${e.courseId}`);
      else if (e.enrolledOn < course.publishedOn!) problems.push(`${e.id}: enrolled before the course existed`);
    }
    expect(problems).toEqual([]);
  });

  it('never reference a draft course, and the pool has drafts', () => {
    const drafts = courses.filter((c) => c.status === 'draft');
    expect(drafts.length).toBeGreaterThan(0);
    const referenced = new Set(rows.map((e) => e.courseId));
    for (const draft of drafts) expect(referenced.has(draft.id), draft.id).toBe(false);
  });

  it('have customer contacts and employees as learners, resolved by getCustomer and getEmployee (first 1,000)', () => {
    const customerPool = makeCustomers(DEMO_REFERENCE_POOL.customers);
    const customerIds = new Set(customerPool.map((c) => c.id));
    const employeePool = new Set(makeEmployees(DEMO_REFERENCE_POOL.employees).map((e) => e.id));
    const kinds = new Set<string>();
    for (const e of rows.slice(0, 1000)) {
      kinds.add(e.learner.kind);
      if (e.learner.kind === 'employee') {
        expect(employeePool.has(e.learner.id), e.id).toBe(true);
        expect(getEmployee(e.learner.id)?.fullName, e.id).toBe(e.learner.name);
      } else {
        const customerId = e.learner.id.replace(/-con-\d+$/, '');
        expect(customerIds.has(customerId), e.id).toBe(true);
        const contact = getCustomer(customerId)!.contacts.find((c) => c.id === e.learner.id);
        expect(contact?.fullName, e.id).toBe(e.learner.name);
      }
    }
    expect(kinds).toEqual(new Set(['customer-contact', 'employee']));
  });
});

describe('carts', () => {
  const rows = makeCarts(5000);

  it('has an empty cart among the first 50, and a cart with a coupon', () => {
    expect(makeCarts(50).some((c) => c.lines.length === 0 && c.totalMinor === 0)).toBe(true);
    expect(makeCarts(50).some((c) => c.couponCode !== null)).toBe(true);
  });

  it('has 0 to 15 lines of active products at list price in the customer currency, and a total that adds up', () => {
    // Problems are collected, not asserted one by one: 5,000 carts x 15 lines of `expect` calls are slow.
    const problems: string[] = [];
    for (const cart of rows) {
      const customer = getCustomer(cart.customerId)!;
      if (cart.currency !== customer.currency) problems.push(`${cart.id}: currency`);
      if (!customer.contacts.some((c) => c.fullName === cart.buyerName)) problems.push(`${cart.id}: buyer`);
      if (cart.lines.length > 15) problems.push(`${cart.id}: ${cart.lines.length} lines`);
      const percent = cart.couponCode === null ? 0 : Number(cart.couponCode.replace(/\D+/g, ''));
      let total = 0;
      const products = new Set<string>();
      cart.lines.forEach((line, k) => {
        const product = getProduct(line.productId)!;
        const gross = line.quantity * line.unitPriceMinor;
        if (product.status !== 'active') problems.push(`${line.id}: product ${product.status}`);
        if (line.id !== `${cart.id}-line-${k + 1}`) problems.push(`${line.id}: id`);
        if (line.unitPriceMinor !== product.listPriceMinor[cart.currency]) problems.push(`${line.id}: price`);
        if (line.discountPercent !== percent) problems.push(`${line.id}: discount`);
        if (line.lineTotalMinor !== lineTotalMinor(line.quantity, line.unitPriceMinor, percent)) problems.push(`${line.id}: total`);
        if (line.lineTotalMinor !== gross - discountMinor(gross, percent)) problems.push(`${line.id}: total (discountMinor)`);
        products.add(line.productId);
        total += line.lineTotalMinor;
      });
      if (products.size !== cart.lines.length) problems.push(`${cart.id}: repeated product`);
      if (cart.totalMinor !== total) problems.push(`${cart.id}: total ${cart.totalMinor} vs ${total}`);
    }
    expect(problems).toEqual([]);
  });

  it('only has a coupon on a non-empty cart, and a checked-out cart is never empty', () => {
    for (const cart of rows) {
      if (cart.couponCode !== null) expect(cart.lines.length, cart.id).toBeGreaterThan(0);
      if (cart.status === 'checked-out') expect(cart.lines.length, cart.id).toBeGreaterThan(0);
    }
  });

  it('references customers within the pool, and an archived customer only has checked-out carts', () => {
    const ids = new Map(makeCustomers(DEMO_REFERENCE_POOL.customers).map((c) => [c.id, c]));
    for (const cart of makeCarts(1000)) {
      const customer = ids.get(cart.customerId);
      expect(customer, cart.id).toBeDefined();
      if (customer!.status === 'archived') expect(cart.status, cart.id).toBe('checked-out');
      expect(cart.updatedAt >= customer!.createdOn, cart.id).toBe(true);
    }
  });

  it('has yen carts with whole-yen prices', () => {
    const yen = rows.filter((c) => c.currency === 'JPY' && c.lines.length > 0);
    expect(yen.length).toBeGreaterThan(10);
    for (const cart of yen) {
      expect(Number.isInteger(cart.totalMinor)).toBe(true);
      for (const line of cart.lines) {
        expect(Number.isInteger(line.unitPriceMinor)).toBe(true);
        expect(Number.isInteger(line.lineTotalMinor)).toBe(true);
      }
    }
  });

  it('dates: a checked-out cart was updated before DEMO_TODAY, an active one in the last days', () => {
    const today = isoToDayNumber(DEMO_TODAY);
    for (const cart of rows) {
      const age = today - isoToDayNumber(cart.updatedAt);
      if (cart.status === 'checked-out') expect(age, cart.id).toBeGreaterThanOrEqual(1);
      if (cart.status === 'active') expect(age, cart.id).toBeLessThanOrEqual(3);
    }
    expect(rows.some((c) => c.status === 'active')).toBe(true);
  });
});
