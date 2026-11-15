// @vitest-environment node
// The transactional documents (ticket #514): sales and purchase orders, invoices, support cases.
// Coherence of lines and totals, of statuses and dates, and referential integrity across domains.
import { daysBetween, DEMO_TODAY } from './dates';
import {
  DEMO_REFERENCE_POOL,
  getInvoice,
  getPurchaseOrder,
  getSalesOrder,
  getSupportCase,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  lineTotalMinor,
  makeCustomers,
  makeEmployees,
  makeInvoices,
  makeProducts,
  makePurchaseOrders,
  makeSalesOrders,
  makeSuppliers,
  makeSupportCases,
  PAYMENT_TERMS_DAYS,
  PURCHASE_ORDER_STATUS_LABEL,
  PURCHASE_ORDER_STATUS_TONE,
  SALES_ORDER_STATUS_LABEL,
  SALES_ORDER_STATUS_TONE,
  SUPPORT_CASE_PRIORITY_LABEL,
  SUPPORT_CASE_PRIORITY_TONE,
  SUPPORT_CASE_STATUS_LABEL,
  SUPPORT_CASE_STATUS_TONE,
  formatMoney,
  type DemoOrderLine,
} from './index';

const customers = makeCustomers(DEMO_REFERENCE_POOL.customers);
const suppliers = makeSuppliers(DEMO_REFERENCE_POOL.suppliers);
const products = makeProducts(DEMO_REFERENCE_POOL.products);
const employees = makeEmployees(DEMO_REFERENCE_POOL.employees);
const customerById = new Map(customers.map((c) => [c.id, c]));
const supplierById = new Map(suppliers.map((s) => [s.id, s]));
const productById = new Map(products.map((p) => [p.id, p]));
const employeeById = new Map(employees.map((e) => [e.id, e]));
const TONES = new Set(['neutral', 'info', 'success', 'warning', 'error']);

/** Independent check of `<prefix>-<year>-<day of year, 3 digits><row, 6 digits>` against the row id and the date. */
function numberProblem(prefix: string, number: string, isoDate: string, id: string): string | null {
  const match = /^([A-Z]+)-(\d{4})-(\d{3})(\d{6})$/.exec(number);
  if (!match) return `${id}: number ${number}`;
  const year = isoDate.slice(0, 4);
  const dayOfYear = daysBetween(`${year}-01-01`, isoDate) + 1;
  const row = Number(id.slice(id.indexOf('-') + 1));
  return match[1] === prefix && match[2] === year && Number(match[3]) === dayOfYear && Number(match[4]) === row ? null : `${id}: number ${number} for ${isoDate}`;
}

/** Sorting by number (as text) must sort by date: no document is numbered before an earlier one. */
function chronologyProblems(rows: readonly { number: string; id: string }[], dateOf: (row: never) => string): string[] {
  const sorted = [...rows].sort((a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));
  const problems: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1]!.number === sorted[i]!.number) problems.push(`${sorted[i]!.id}: duplicate number`);
    if (dateOf(sorted[i - 1] as never) > dateOf(sorted[i] as never)) problems.push(`${sorted[i]!.number} is dated before ${sorted[i - 1]!.number}`);
  }
  return problems;
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe('status labels and tones', () => {
  it.each([
    ['sales order', SALES_ORDER_STATUS_LABEL, SALES_ORDER_STATUS_TONE, ['draft', 'confirmed', 'shipped', 'invoiced', 'cancelled']],
    ['purchase order', PURCHASE_ORDER_STATUS_LABEL, PURCHASE_ORDER_STATUS_TONE, ['draft', 'sent', 'received', 'closed']],
    ['invoice', INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, ['issued', 'paid', 'overdue', 'disputed']],
    ['support case', SUPPORT_CASE_STATUS_LABEL, SUPPORT_CASE_STATUS_TONE, ['new', 'open', 'pending', 'resolved', 'closed']],
    ['support case priority', SUPPORT_CASE_PRIORITY_LABEL, SUPPORT_CASE_PRIORITY_TONE, ['low', 'normal', 'high', 'urgent']],
  ] as const)('%s: one English label and one StatusBadge tone per status', (_, labels, tones, statuses) => {
    expect(Object.keys(labels).sort()).toEqual([...statuses].sort());
    expect(Object.keys(tones).sort()).toEqual([...statuses].sort());
    for (const status of statuses) {
      expect((labels as Record<string, string>)[status]).toMatch(/^[A-Z][A-Za-z ]+$/);
      expect(TONES.has((tones as Record<string, string>)[status]!)).toBe(true);
    }
    expect(new Set(Object.values(labels)).size).toBe(statuses.length);
  });
});

function expectLines(lines: readonly DemoOrderLine[], orderId: string, currency: 'EUR' | 'USD' | 'GBP' | 'JPY', price: 'listPriceMinor' | 'unitCostMinor') {
  const problems: string[] = [];
  const seen = new Set<string>();
  lines.forEach((line, k) => {
    const product = productById.get(line.productId);
    if (line.id !== `${orderId}-line-${k + 1}`) problems.push(`${line.id}: id`);
    if (!product) problems.push(`${line.id}: unknown product ${line.productId}`);
    else {
      if (product.status === 'draft') problems.push(`${line.id}: draft product`);
      if (line.unitPriceMinor !== product[price][currency]) problems.push(`${line.id}: price ${line.unitPriceMinor}`);
    }
    if (seen.has(line.productId)) problems.push(`${line.id}: product repeated`);
    seen.add(line.productId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1) problems.push(`${line.id}: quantity`);
    if (!Number.isInteger(line.discountPercent) || line.discountPercent < 0 || line.discountPercent > 30) problems.push(`${line.id}: discount`);
    if (line.lineTotalMinor !== lineTotalMinor(line.quantity, line.unitPriceMinor, line.discountPercent) || line.lineTotalMinor < 1) {
      problems.push(`${line.id}: line total ${line.lineTotalMinor}`);
    }
    if (!Number.isSafeInteger(line.unitPriceMinor) || !Number.isSafeInteger(line.lineTotalMinor)) problems.push(`${line.id}: not an integer`);
  });
  return problems;
}

describe('makeSalesOrders / getSalesOrder', () => {
  const orders = makeSalesOrders(10_000);

  it('has a number, a customer of the pool in its currency, a status and coherent dates (10,000 orders)', () => {
    const problems: string[] = [];
    const numbers = new Set<string>();
    for (const order of orders) {
      const customer = customerById.get(order.customerId);
      if (!customer) {
        problems.push(`${order.id}: unknown customer`);
        continue;
      }
      if (order.currency !== customer.currency) problems.push(`${order.id}: currency`);
      if (order.accountManagerId !== customer.accountManagerId || !employeeById.has(order.accountManagerId)) problems.push(`${order.id}: manager`);
      const numberIssue = numberProblem('SO', order.number, order.orderDate, order.id);
      if (numberIssue) problems.push(numberIssue);
      numbers.add(order.number);
      if (!(order.status in SALES_ORDER_STATUS_LABEL)) problems.push(`${order.id}: status`);
      const sinceOrder = daysBetween(order.orderDate, DEMO_TODAY);
      if (sinceOrder < 0) problems.push(`${order.id}: order in the future`);
      if (daysBetween(customer.createdOn, order.orderDate) < 0) problems.push(`${order.id}: before the customer existed`);
      const wait = daysBetween(order.orderDate, order.requestedDeliveryDate);
      if (wait < 7 || wait > 45) problems.push(`${order.id}: delivery after ${wait} days`);
      if (!Number.isSafeInteger(order.totalMinor) || order.totalMinor <= 0) problems.push(`${order.id}: total`);
      if (order.lineCount < 1 || order.lineCount > 18) problems.push(`${order.id}: lineCount`);
    }
    expect(problems).toEqual([]);
    expect(numbers.size).toBe(orders.length);
  });

  it('the total of every order is the sum of its lines, and every line is coherent (10,000 orders)', () => {
    const problems: string[] = [];
    for (const order of orders) {
      const detail = getSalesOrder(order.id)!;
      if (detail.lines.length !== order.lineCount) problems.push(`${order.id}: ${detail.lines.length} lines for lineCount ${order.lineCount}`);
      if (sum(detail.lines.map((line) => line.lineTotalMinor)) !== order.totalMinor) problems.push(`${order.id}: total`);
      problems.push(...expectLines(detail.lines, order.id, order.currency, 'listPriceMinor'));
    }
    expect(problems).toEqual([]);
  });

  it('the detail of an id is always the same, and is the list row plus its lines', () => {
    const order = makeSalesOrders(20)[3]!;
    const detail = getSalesOrder(order.id)!;
    expect(getSalesOrder(order.id)).toBe(detail);
    expect({ ...detail, lines: undefined }).toEqual({ ...order, lines: undefined });
    expect(detail.lines.length).toBeGreaterThan(0);
    expect(getSalesOrder('so-999999')).toEqual(getSalesOrder('so-999999'));
  });

  it('has single-line orders and long orders (12 lines or more), the long ones within the first rows', () => {
    expect(orders.some((order) => order.lineCount === 1)).toBe(true);
    expect(orders.filter((order) => order.lineCount >= 12).length).toBeGreaterThan(300);
    expect(makeSalesOrders(50).some((order) => order.lineCount >= 12)).toBe(true);
    expect(makeSalesOrders(50).some((order) => order.lineCount === 1)).toBe(true);
  });

  it('numbers follow the order date: sorting by number sorts by date', () => {
    expect(chronologyProblems(orders, (o: (typeof orders)[number]) => o.orderDate)).toEqual([]);
  });

  it('an archived customer has no open order (draft, confirmed, shipped), but may have old invoiced or cancelled ones', () => {
    const many = makeSalesOrders(20_000);
    const archived = many.filter((order) => customerById.get(order.customerId)!.status === 'archived');
    expect(archived.length).toBeGreaterThan(50);
    expect(archived.filter((order) => ['draft', 'confirmed', 'shipped'].includes(order.status)).map((order) => order.id)).toEqual([]);
  });

  it('an invoiced order has been delivered at least 5 days ago (its invoice can follow it)', () => {
    for (const order of orders.filter((o) => o.status === 'invoiced')) expect(daysBetween(order.requestedDeliveryDate, DEMO_TODAY)).toBeGreaterThanOrEqual(5);
  });

  it('shows every status within the first 50 rows', () => {
    expect(new Set(makeSalesOrders(50).map((order) => order.status))).toEqual(new Set(Object.keys(SALES_ORDER_STATUS_LABEL)));
  });

  it('JPY orders carry whole yen only, and format without decimals', () => {
    const yen = orders.filter((order) => order.currency === 'JPY');
    expect(yen.length).toBeGreaterThan(100);
    for (const order of yen.slice(0, 200)) {
      expect(Number.isInteger(order.totalMinor)).toBe(true);
      expect(formatMoney(order.totalMinor, 'JPY')).not.toContain('.');
      for (const line of getSalesOrder(order.id)!.lines) {
        expect(Number.isInteger(line.unitPriceMinor) && Number.isInteger(line.lineTotalMinor)).toBe(true);
        expect(line.unitPriceMinor % 10).toBe(0);
      }
    }
    // The same orders in euros keep cents.
    const euro = orders.find((order) => order.currency === 'EUR')!;
    expect(formatMoney(euro.totalMinor, 'EUR')).toMatch(/\.\d\d$/);
  });

  it('repeats customers deterministically when n is larger than the customer pool', () => {
    const many = makeSalesOrders(5000);
    const used = new Set(many.map((order) => order.customerId));
    expect(many.length).toBeGreaterThan(customers.length);
    expect(used.size).toBeLessThanOrEqual(customers.length);
    expect(many).toEqual(orders.slice(0, 5000));
  });
});

describe('makePurchaseOrders / getPurchaseOrder', () => {
  const orders = makePurchaseOrders(10_000);

  it('points at an active supplier of the pool, in its currency, with its buyer (10,000 orders)', () => {
    const problems: string[] = [];
    const numbers = new Set<string>();
    for (const order of orders) {
      const supplier = supplierById.get(order.supplierId);
      if (!supplier) {
        problems.push(`${order.id}: unknown supplier`);
        continue;
      }
      if (supplier.status !== 'active') problems.push(`${order.id}: supplier ${supplier.status}`);
      if (order.currency !== supplier.currency) problems.push(`${order.id}: currency`);
      if (order.buyerId !== supplier.buyerId || !employeeById.has(order.buyerId)) problems.push(`${order.id}: buyer`);
      const numberIssue = numberProblem('PO', order.number, order.orderDate, order.id);
      if (numberIssue) problems.push(numberIssue);
      numbers.add(order.number);
      if (daysBetween(order.orderDate, DEMO_TODAY) < 0) problems.push(`${order.id}: order in the future`);
      if (daysBetween(supplier.createdOn, order.orderDate) < 0) problems.push(`${order.id}: before the supplier existed`);
      const wait = daysBetween(order.orderDate, order.expectedDeliveryDate);
      if (wait < supplier.leadTimeDays || wait > supplier.leadTimeDays + 5) problems.push(`${order.id}: delivery after ${wait} days (lead time ${supplier.leadTimeDays})`);
      if (!(order.status in PURCHASE_ORDER_STATUS_LABEL)) problems.push(`${order.id}: status`);
    }
    expect(problems).toEqual([]);
    expect(numbers.size).toBe(orders.length);
  });

  it('totals are the sum of the lines, lines are products of the supplier category at unit cost (10,000 orders)', () => {
    const problems: string[] = [];
    for (const order of orders) {
      const detail = getPurchaseOrder(order.id)!;
      const supplier = supplierById.get(order.supplierId)!;
      if (detail.lines.length !== order.lineCount) problems.push(`${order.id}: lineCount`);
      if (sum(detail.lines.map((line) => line.lineTotalMinor)) !== order.totalMinor || order.totalMinor <= 0) problems.push(`${order.id}: total`);
      problems.push(...expectLines(detail.lines, order.id, order.currency, 'unitCostMinor'));
      for (const line of detail.lines) if (productById.get(line.productId)?.category !== supplier.category) problems.push(`${line.id}: category`);
    }
    expect(problems).toEqual([]);
  });

  it('numbers follow the order date: sorting by number sorts by date', () => {
    expect(chronologyProblems(orders, (o: (typeof orders)[number]) => o.orderDate)).toEqual([]);
  });

  it('shows every status within the first 50 rows, and has one-line and long orders', () => {
    expect(new Set(makePurchaseOrders(50).map((order) => order.status))).toEqual(new Set(Object.keys(PURCHASE_ORDER_STATUS_LABEL)));
    expect(orders.some((order) => order.lineCount === 1)).toBe(true);
    expect(orders.some((order) => order.lineCount >= 12)).toBe(true);
  });

  it('the detail of an id is always the same', () => {
    const detail = getPurchaseOrder('po-7')!;
    expect(getPurchaseOrder('po-7')).toBe(detail);
    expect(detail.id).toBe('po-7');
  });
});

describe('makeInvoices / getInvoice', () => {
  const invoices = makeInvoices(10_000);
  const salesOrders = makeSalesOrders(40_000);

  it('each invoice bills an invoiced order of the same customer, currency and amount; no order twice', () => {
    const problems: string[] = [];
    const billed = new Set<string>();
    const orderById = new Map(salesOrders.map((order) => [order.id, order]));
    for (const invoice of invoices) {
      const order = orderById.get(invoice.salesOrderId);
      if (!order) {
        problems.push(`${invoice.id}: order ${invoice.salesOrderId} not in the first 40,000`);
        continue;
      }
      if (order.status !== 'invoiced') problems.push(`${invoice.id}: order is ${order.status}`);
      if (invoice.customerId !== order.customerId || invoice.currency !== order.currency) problems.push(`${invoice.id}: customer or currency`);
      if (invoice.totalMinor !== order.totalMinor || invoice.totalMinor <= 0) problems.push(`${invoice.id}: amount`);
      if (billed.has(order.id)) problems.push(`${invoice.id}: order billed twice`);
      billed.add(order.id);
    }
    expect(problems).toEqual([]);
  });

  it('every invoiced order has an invoice, in order, and cancelled or draft orders have none', () => {
    const invoicedIds = salesOrders.filter((order) => order.status === 'invoiced').map((order) => order.id);
    const firstInvoices = makeInvoices(2000);
    expect(firstInvoices.map((invoice) => invoice.salesOrderId)).toEqual(invoicedIds.slice(0, 2000));
    const billed = new Set(invoices.map((invoice) => invoice.salesOrderId));
    for (const order of salesOrders.slice(0, 2000)) if (order.status === 'cancelled' || order.status === 'draft') expect(billed.has(order.id)).toBe(false);
  });

  it('due date = issue date + the customer payment terms; issue after the order, never in the future', () => {
    const problems: string[] = [];
    const orderById = new Map(salesOrders.map((order) => [order.id, order]));
    for (const invoice of invoices) {
      const customer = customerById.get(invoice.customerId)!;
      if (daysBetween(invoice.issueDate, invoice.dueDate) !== PAYMENT_TERMS_DAYS[customer.paymentTerms]) problems.push(`${invoice.id}: terms`);
      // Invoiced when the goods go out: the requested delivery date or up to five days after it.
      const sinceDelivery = daysBetween(orderById.get(invoice.salesOrderId)!.requestedDeliveryDate, invoice.issueDate);
      if (sinceDelivery < 0 || sinceDelivery > 5) problems.push(`${invoice.id}: issued ${sinceDelivery} days after the delivery date`);
      if (daysBetween(invoice.issueDate, DEMO_TODAY) < 0) problems.push(`${invoice.id}: issued in the future`);
      const numberIssue = numberProblem('INV', invoice.number, invoice.issueDate, invoice.id);
      if (numberIssue) problems.push(numberIssue);
    }
    expect(problems).toEqual([]);
  });

  it('status is derived from the dates against DEMO_TODAY: overdue = unpaid and due before it', () => {
    const problems: string[] = [];
    for (const invoice of invoices) {
      const dueBeforeToday = invoice.dueDate < DEMO_TODAY;
      if ((invoice.status === 'paid') !== (invoice.paidOn !== null)) problems.push(`${invoice.id}: paidOn`);
      if (invoice.paidOn !== null && (invoice.paidOn < invoice.issueDate || invoice.paidOn > DEMO_TODAY)) problems.push(`${invoice.id}: paid on ${invoice.paidOn}`);
      if (invoice.status === 'overdue' && !dueBeforeToday) problems.push(`${invoice.id}: overdue but due ${invoice.dueDate}`);
      if (invoice.status === 'issued' && dueBeforeToday) problems.push(`${invoice.id}: issued but due ${invoice.dueDate}`);
    }
    expect(problems).toEqual([]);
    // Unpaid, undisputed and past due is never reported as anything else, and the reverse.
    expect(invoices.filter((invoice) => invoice.status === 'overdue').length).toBeGreaterThan(500);
    expect(invoices.filter((invoice) => invoice.status === 'issued').length).toBeGreaterThan(100);
    expect(invoices.filter((invoice) => invoice.status === 'disputed').length).toBeGreaterThan(50);
  });

  it('an archived customer has no open invoice (issued, overdue, disputed): only paid ones', () => {
    const archived = invoices.filter((invoice) => customerById.get(invoice.customerId)!.status === 'archived');
    expect(archived.length).toBeGreaterThan(50);
    expect(archived.filter((invoice) => invoice.status !== 'paid').map((invoice) => `${invoice.id}: ${invoice.status}`)).toEqual([]);
    // ... while the other customers still have every status.
    const others = new Set(invoices.filter((invoice) => customerById.get(invoice.customerId)!.status !== 'archived').map((invoice) => invoice.status));
    expect(others).toEqual(new Set(Object.keys(INVOICE_STATUS_LABEL)));
  });

  it('has at least one overdue invoice in the first 20, and every status in the first 50', () => {
    expect(makeInvoices(20).some((invoice) => invoice.status === 'overdue')).toBe(true);
    expect(new Set(makeInvoices(50).map((invoice) => invoice.status))).toEqual(new Set(Object.keys(INVOICE_STATUS_LABEL)));
  });

  it('is the same whatever the system clock says (fresh module graph on a clock in 2035)', async () => {
    const before = JSON.stringify(makeInvoices(300));
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2035-06-01T12:00:00Z'));
      vi.resetModules();
      const fresh = (await import('./invoices')) as typeof import('./invoices');
      expect(JSON.stringify(fresh.makeInvoices(300))).toBe(before);
      expect(fresh.makeInvoices(20).some((invoice) => invoice.status === 'overdue')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('numbers follow the issue date: sorting by number sorts by date (EU invoice numbering)', () => {
    expect(chronologyProblems(invoices, (i: (typeof invoices)[number]) => i.issueDate)).toEqual([]);
  });

  it('getInvoice resolves ids', () => {
    expect(getInvoice('inv-5')).toBe(makeInvoices(10)[4]);
  });
});

describe('makeSupportCases / getSupportCase', () => {
  const cases = makeSupportCases(10_000);

  it('points at a customer and a product of the pool, with a valid assignee or none (10,000 cases)', () => {
    const problems: string[] = [];
    for (const supportCase of cases) {
      if (!customerById.has(supportCase.customerId)) problems.push(`${supportCase.id}: customer`);
      const product = productById.get(supportCase.productId);
      if (!product || product.status === 'draft') problems.push(`${supportCase.id}: product`);
      else if (!supportCase.subject.includes(product.sku)) problems.push(`${supportCase.id}: subject ${supportCase.subject}`);
      if (supportCase.assigneeId === null) {
        if (supportCase.status !== 'new') problems.push(`${supportCase.id}: ${supportCase.status} without an assignee`);
      } else {
        const assignee = employeeById.get(supportCase.assigneeId);
        if (assignee?.department !== 'customer-service' || assignee.status === 'inactive') problems.push(`${supportCase.id}: assignee ${supportCase.assigneeId}`);
      }
      const sla = { low: 10, normal: 5, high: 2, urgent: 1 }[supportCase.priority];
      if (daysBetween(supportCase.openedOn, supportCase.slaDueDate) !== sla) problems.push(`${supportCase.id}: SLA`);
      if (daysBetween(supportCase.openedOn, DEMO_TODAY) < 0) problems.push(`${supportCase.id}: opened in the future`);
      if (daysBetween(customerById.get(supportCase.customerId)!.createdOn, supportCase.openedOn) < 0) problems.push(`${supportCase.id}: before the customer existed`);
    }
    expect(problems).toEqual([]);
  });

  it('comments: counted in the row, authored by a contact or the assignee, strictly increasing, never in the future (10,000 cases)', () => {
    const problems: string[] = [];
    const now = `${DEMO_TODAY}T18:00`;
    for (const supportCase of cases) {
      const detail = getSupportCase(supportCase.id)!;
      if (detail.comments.length !== supportCase.commentCount) problems.push(`${supportCase.id}: count`);
      const customer = customerById.get(supportCase.customerId)!;
      let previous = '';
      detail.comments.forEach((comment, k) => {
        if (comment.id !== `${supportCase.id}-cmt-${k + 1}`) problems.push(`${comment.id}: id`);
        if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(comment.postedAt)) problems.push(`${comment.id}: format ${comment.postedAt}`);
        if (comment.postedAt <= previous) problems.push(`${comment.id}: not increasing`);
        if (comment.postedAt.slice(0, 10) < supportCase.openedOn || comment.postedAt > now) problems.push(`${comment.id}: ${comment.postedAt}`);
        previous = comment.postedAt;
        if (comment.authorKind === 'customer') {
          const contact = customer.contacts.find((c) => c.id === comment.authorId);
          if (!contact || contact.fullName !== comment.authorName) problems.push(`${comment.id}: contact`);
        } else if (comment.authorId !== supportCase.assigneeId || employeeById.get(comment.authorId)?.fullName !== comment.authorName) {
          problems.push(`${comment.id}: employee author`);
        }
        if (comment.text.length === 0) problems.push(`${comment.id}: empty`);
      });
      if (new Set(detail.comments.map((comment) => comment.id)).size !== detail.comments.length) problems.push(`${supportCase.id}: duplicate comment ids`);
      if (supportCase.assigneeId === null && detail.comments.some((comment) => comment.authorKind === 'employee')) problems.push(`${supportCase.id}: reply without assignee`);
    }
    expect(problems).toEqual([]);
  });

  it('a case opened a day or two ago with several comments still ends before 18:00 today (tightest budget)', () => {
    const young = makeSupportCases(100_000).filter((c) => c.commentCount >= 3 && daysBetween(c.openedOn, DEMO_TODAY) <= 2);
    expect(young.length).toBeGreaterThan(200);
    const now = `${DEMO_TODAY}T18:00`;
    const late = young.filter((c) => getSupportCase(c.id)!.comments.some((comment) => comment.postedAt > now));
    expect(late.map((c) => c.id)).toEqual([]);
  });

  it('has cases without comments, and long comments (to exercise truncation)', () => {
    expect(cases.some((supportCase) => supportCase.commentCount === 0)).toBe(true);
    expect(cases.filter((supportCase) => supportCase.commentCount === 0).every((supportCase) => supportCase.status === 'new')).toBe(true);
    const lengths = cases.slice(0, 1500).flatMap((supportCase) => getSupportCase(supportCase.id)!.comments.map((comment) => comment.text.length));
    expect(Math.max(...lengths)).toBeGreaterThan(400);
    expect(Math.min(...lengths)).toBeLessThan(200);
  });

  it('an archived customer has only closed cases', () => {
    const many = makeSupportCases(20_000);
    const archived = many.filter((c) => customerById.get(c.customerId)!.status === 'archived');
    expect(archived.length).toBeGreaterThan(50);
    expect(archived.filter((c) => c.status !== 'closed').map((c) => c.id)).toEqual([]);
  });

  describe('threads', () => {
    const SENTENCE_END = /(?<=\.|\?) /;
    const threads = cases.slice(0, 3000).map((supportCase) => getSupportCase(supportCase.id)!);
    const withComments = threads.filter((thread) => thread.comments.length > 0);
    // What each subject's opening message must talk about.
    const OPENING_KEYWORD: readonly (readonly [RegExp, RegExp])[] = [
      [/^Wrong quantity/, /quantity|units/],
      [/^Damaged packaging/, /damaged/],
      [/^Certificate of conformity/, /certificate of conformity/],
      [/^Delivery of .* is late/, /promised/],
      [/^Quotation request/, /quotation/],
      [/^Invoice price/, /price/],
      [/^Return request/, /return/],
      [/^Technical data sheet/, /data sheet/],
      [/^Substitute/, /equivalent/],
    ];

    it('never repeats a sentence within a message (10,000 cases)', () => {
      const repeats: string[] = [];
      for (const supportCase of cases) {
        for (const comment of getSupportCase(supportCase.id)!.comments) {
          const sentences = comment.text.split(SENTENCE_END);
          if (new Set(sentences).size !== sentences.length) repeats.push(comment.id);
        }
      }
      expect(repeats).toEqual([]);
    });

    it('long messages exist (6 sentences or more); the others have 3 at most', () => {
      const counts = withComments.flatMap((thread) => thread.comments.map((comment) => comment.text.split(SENTENCE_END).length));
      expect(Math.max(...counts)).toBeGreaterThanOrEqual(7);
      expect(counts.filter((n) => n >= 4 && n <= 5).length).toBe(0);
    });

    it('opens with the customer, never with a thanks, about the product and the subject of the case', () => {
      const problems: string[] = [];
      for (const thread of withComments) {
        const [first] = thread.comments;
        const sku = productById.get(thread.productId)!.sku;
        if (first!.authorKind !== 'customer') problems.push(`${thread.id}: opens with the employee`);
        if (/^thank/i.test(first!.text) || /thank|solves it/i.test(first!.text.split(SENTENCE_END)[0]!)) problems.push(`${thread.id}: opens with thanks`);
        if (!first!.text.includes(sku)) problems.push(`${thread.id}: opening does not name ${sku}`);
        const keyword = OPENING_KEYWORD.find(([subject]) => subject.test(thread.subject));
        if (!keyword || !keyword[1].test(first!.text)) problems.push(`${thread.id}: opening does not match "${thread.subject}"`);
      }
      expect(problems).toEqual([]);
    });

    it('alternates customer and employee, and ends with whoever the status waits for', () => {
      const problems: string[] = [];
      for (const thread of withComments) {
        thread.comments.forEach((comment, k) => {
          if (k > 0 && comment.authorKind === thread.comments[k - 1]!.authorKind) problems.push(`${comment.id}: same author twice in a row`);
        });
        const last = thread.comments[thread.comments.length - 1]!;
        // new and open wait for the employee; pending waits for the customer; resolved and closed end with the solution.
        const expected = thread.status === 'new' || thread.status === 'open' ? 'customer' : 'employee';
        if (last.authorKind !== expected) problems.push(`${thread.id}: ${thread.status} ends with the ${last.authorKind}`);
      }
      expect(problems).toEqual([]);
      expect(withComments.filter((thread) => thread.status === 'pending').length).toBeGreaterThan(100);
    });

    it('a pending case ends with a question to the customer, resolved and closed ones with a solution (no question)', () => {
      for (const thread of withComments) {
        const last = thread.comments[thread.comments.length - 1]!;
        if (thread.status === 'pending') expect(last.text, thread.id).toContain('?');
        if (thread.status === 'resolved' || thread.status === 'closed') expect(last.text, thread.id).not.toContain('?');
      }
    });

    it('has one contact of the customer per thread', () => {
      for (const thread of withComments) {
        const contacts = new Set(thread.comments.filter((comment) => comment.authorKind === 'customer').map((comment) => comment.authorId));
        expect(contacts.size).toBe(1);
      }
      // ... and not always the same position in the list of contacts.
      const positions = new Set(withComments.map((thread) => customerById.get(thread.customerId)!.contacts.findIndex((c) => c.id === thread.comments[0]!.authorId)));
      expect(positions.size).toBeGreaterThan(1);
    });

    it('a solution ends resolved and closed threads, a closed one says so, and the first answer of a long thread does not solve it', () => {
      for (const thread of withComments) {
        const sku = productById.get(thread.productId)!.sku;
        const employeeComments = thread.comments.filter((comment) => comment.authorKind === 'employee');
        if (thread.status === 'resolved' || thread.status === 'closed') {
          expect(employeeComments[employeeComments.length - 1]!.text).toContain(sku);
        }
        if (thread.status === 'closed') expect(thread.comments[thread.comments.length - 1]!.text).toContain('I am closing this case');
        else expect(thread.comments.some((comment) => comment.text.includes('I am closing this case'))).toBe(false);
        // Nobody thanks for a solution before there is one.
        if (thread.comments.length >= 4) expect(thread.comments[1]!.text).not.toMatch(/credit note has been issued|I am closing/);
      }
    });

    it('comments are written in working hours (08:00-17:59), the opening one on the day the case was opened', () => {
      const outside: string[] = [];
      for (const thread of withComments) {
        expect(thread.comments[0]!.postedAt.slice(0, 10)).toBe(thread.openedOn);
        for (const comment of thread.comments) {
          const hour = Number(comment.postedAt.slice(11, 13));
          if (hour < 8 || hour >= 18) outside.push(`${comment.id} at ${comment.postedAt}`);
        }
      }
      expect(outside).toEqual([]);
    });

    it('has comments in every working hour (not a thread frozen at one time of day) and most threads span several days', () => {
      const hours = new Set(withComments.flatMap((thread) => thread.comments.map((comment) => Number(comment.postedAt.slice(11, 13)))));
      expect([...hours].sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
      const multiDay = withComments.filter((thread) => thread.comments.length >= 3 && thread.comments[thread.comments.length - 1]!.postedAt.slice(0, 10) !== thread.openedOn);
      expect(multiDay.length).toBeGreaterThan(100);
    });

    // The conversation read as a person would (ticket #514, round 3), checked on 10,000 cases from the
    // texts alone: a question ends with "?", a reminder is a customer message whose first sentence is one.
    describe('conversation (10,000 cases)', () => {
      const all = cases.map((supportCase) => getSupportCase(supportCase.id)!).filter((thread) => thread.comments.length > 0);
      const sentences = (text: string): string[] => text.split(SENTENCE_END);
      const asks = (text: string): boolean => text.includes('?');
      const isReminder = (thread: (typeof all)[number], k: number): boolean => k > 0 && thread.comments[k]!.authorKind === 'customer' && sentences(thread.comments[k]!.text)[0]!.endsWith('?');
      /** The question that closes a proposal ("I can ... . Is that fine for you?"). */
      const CONFIRM = /(Is that fine for you|Shall I go ahead|Would that work for you)\?$/;
      const ACCEPT = /^(Yes\b|That works)/;
      /** Everything in the generator that promises, takes charge or waits: none of it may close a resolved case. */
      const WAITING = /\bI will\b|\bwill (confirm|come back|write)\b|as soon as|waiting for|until it is solved|\bI am (checking|looking|preparing|getting|comparing|working|arranging)\b|at any time|I have started|\bstill\b/;
      const CLOSING = 'I am closing this case, please open a new one if you need anything else.';
      /** What a solution consists of: the resolution must carry the same ones as the proposal it follows. */
      const SOLUTION_WORDS = [
        'separate shipment',
        'credit note',
        'replacement',
        'all the batches',
        'quality department',
        'carrier',
        'express courier',
        'volume discount',
        'two shipments',
        'cancel',
        'return label',
        'collect',
        'safety data sheet',
        'installation instructions',
        'another supplier',
        'sample',
      ];
      const solutionWords = (text: string): string => SOLUTION_WORDS.filter((word) => text.includes(word)).join(', ');
      const STOP_WORDS = new Set(['could', 'would', 'which', 'about', 'there', 'their', 'these', 'other']);
      const words = (text: string, sku: string): Set<string> =>
        new Set(
          text
            .replaceAll(sku, ' ')
            .toLowerCase()
            .split(/[^a-z]+/)
            .filter((word) => word.length >= 5 && !STOP_WORDS.has(word)),
        );

      it('a customer follow-up that answers a request comes right after an employee question; a reminder only after a message that asks nothing', () => {
        const problems: string[] = [];
        let answers = 0;
        let reminders = 0;
        for (const thread of all) {
          thread.comments.forEach((comment, k) => {
            if (k === 0 || comment.authorKind !== 'customer') return;
            const previous = thread.comments[k - 1]!;
            if (isReminder(thread, k)) {
              reminders++;
              if (asks(previous.text)) problems.push(`${comment.id}: a reminder instead of an answer to "${previous.text}"`);
            } else {
              answers++;
              if (!asks(previous.text)) problems.push(`${comment.id}: "${comment.text}" answers "${previous.text}", which asks nothing`);
            }
            if (/you asked for/.test(comment.text) && !asks(previous.text)) problems.push(`${comment.id}: delivers what nobody asked for`);
          });
        }
        expect(problems).toEqual([]);
        expect(answers).toBeGreaterThan(1000);
        expect(reminders).toBeGreaterThan(1000);
      });

      it('an answer is about the question: both name the product and share a word; a yes answers a proposal and nothing else', () => {
        const problems: string[] = [];
        let yes = 0;
        for (const thread of all) {
          const sku = productById.get(thread.productId)!.sku;
          thread.comments.forEach((comment, k) => {
            if (k === 0 || comment.authorKind !== 'customer' || isReminder(thread, k)) return;
            const question = sentences(thread.comments[k - 1]!.text).at(-1)!;
            const first = sentences(comment.text)[0]!;
            if (CONFIRM.test(question)) {
              yes++;
              if (!ACCEPT.test(first)) problems.push(`${comment.id}: "${first}" after the proposal "${question}"`);
            } else {
              if (ACCEPT.test(first)) problems.push(`${comment.id}: a yes to "${question}", which proposes nothing`);
              if (!question.includes(sku) || !first.includes(sku)) problems.push(`${comment.id}: "${first}" / "${question}" do not name ${sku}`);
              const shared = [...words(first, sku)].filter((word) => words(question, sku).has(word));
              if (shared.length === 0) problems.push(`${comment.id}: "${first}" shares nothing with "${question}"`);
            }
          });
        }
        expect(problems).toEqual([]);
        expect(yes).toBeGreaterThan(500);
      });

      it('a reminder is posted on a later day than the message it follows up', () => {
        const problems: string[] = [];
        for (const thread of all) {
          thread.comments.forEach((comment, k) => {
            if (isReminder(thread, k) && comment.postedAt.slice(0, 10) <= thread.comments[k - 1]!.postedAt.slice(0, 10)) {
              problems.push(`${comment.id}: ${comment.postedAt} after ${thread.comments[k - 1]!.postedAt}`);
            }
          });
        }
        expect(problems).toEqual([]);
      });

      it('after the opening (any day), every message is posted Monday to Friday; a case opened on a weekend is answered on a working day', () => {
        const weekend = (iso: string): boolean => [0, 6].includes(new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay());
        const problems: string[] = [];
        let weekendOpenings = 0;
        for (const thread of all) {
          if (weekend(thread.comments[0]!.postedAt) && thread.comments.length > 1) weekendOpenings++;
          thread.comments.forEach((comment, k) => {
            if (k > 0 && weekend(comment.postedAt)) problems.push(`${comment.id}: ${comment.postedAt}`);
          });
        }
        expect(problems).toEqual([]);
        expect(weekendOpenings).toBeGreaterThan(300);
      });

      it('the last message of a resolved or closed case only reports the solution: no promise, no waiting, no question', () => {
        const problems: string[] = [];
        let finals = 0;
        let ongoing = 0;
        for (const thread of all) {
          const done = thread.status === 'resolved' || thread.status === 'closed';
          thread.comments.forEach((comment, k) => {
            const last = k === thread.comments.length - 1;
            if (comment.authorKind !== 'employee') return;
            if (done && last) {
              finals++;
              if (WAITING.test(comment.text)) problems.push(`${comment.id}: "${comment.text}"`);
              if (asks(comment.text)) problems.push(`${comment.id}: asks "${comment.text}"`);
            } else if (WAITING.test(comment.text)) {
              ongoing++;
            }
          });
        }
        expect(problems).toEqual([]);
        expect(finals).toBeGreaterThan(3000);
        // The pattern is not dead: the same phrases are common while a case is being worked on.
        expect(ongoing).toBeGreaterThan(1000);
      });

      it('a closed case says so in its last sentence, and only there: nothing follows the closing sentence', () => {
        const problems: string[] = [];
        for (const thread of all) {
          const mentions = thread.comments.filter((comment) => comment.text.includes('I am closing this case'));
          const last = thread.comments[thread.comments.length - 1]!;
          if (thread.status !== 'closed') {
            if (mentions.length > 0) problems.push(`${thread.id}: ${thread.status} says it is closing`);
          } else if (mentions.length !== 1 || !last.text.endsWith(CLOSING)) {
            problems.push(`${thread.id}: "${last.text}"`);
          }
        }
        expect(problems).toEqual([]);
      });

      it('thanks follow something to thank for: the employee thanks for an answer or a yes, the customer for a proposal', () => {
        const problems: string[] = [];
        let employeeThanks = 0;
        let customerThanks = 0;
        for (const thread of all) {
          thread.comments.forEach((comment, k) => {
            if (k === 0) return;
            const previous = thread.comments[k - 1]!;
            if (comment.authorKind === 'employee') {
              // Thanking the customer for writing in is always possible, so that one sentence is left out.
              if (!/thank/i.test(comment.text.replace('Thank you for contacting us.', ''))) return;
              employeeThanks++;
              if (k - 1 === 0 || isReminder(thread, k - 1)) problems.push(`${comment.id}: "${comment.text}" after "${previous.text}"`);
            } else if (/thank/i.test(comment.text)) {
              customerThanks++;
              if (!CONFIRM.test(sentences(previous.text).at(-1)!)) problems.push(`${comment.id}: "${comment.text}" after "${previous.text}"`);
            }
          });
        }
        expect(problems).toEqual([]);
        expect(employeeThanks).toBeGreaterThan(500);
        expect(customerThanks).toBeGreaterThan(100);
      });

      it('an apology for the wait, or a "still", only answers a reminder', () => {
        const problems: string[] = [];
        let apologies = 0;
        for (const thread of all) {
          thread.comments.forEach((comment, k) => {
            if (comment.authorKind !== 'employee' || !/sorry for the wait|\bstill\b|raised the priority/.test(comment.text)) return;
            apologies++;
            if (!isReminder(thread, k - 1)) problems.push(`${comment.id}: "${comment.text}" after "${thread.comments[k - 1]!.text}"`);
          });
        }
        expect(problems).toEqual([]);
        expect(apologies).toBeGreaterThan(300);
      });

      it('an attachment is mentioned only by the message that carries it, and the customer attaches only what was asked for', () => {
        const problems: string[] = [];
        let customerAttachments = 0;
        for (const thread of all) {
          thread.comments.forEach((comment, k) => {
            if (comment.authorKind === 'customer') {
              if (!/attach|photo/i.test(comment.text)) return;
              customerAttachments++;
              const previous = k === 0 ? '' : thread.comments[k - 1]!.text;
              if (!/send me .*\?/.test(previous)) problems.push(`${comment.id}: "${comment.text}" after "${previous}"`);
              return;
            }
            for (const sentence of sentences(comment.text)) {
              // The employee never refers back to the customer's photos or files: a photo only in a request ...
              if (/photo/i.test(sentence) && !sentence.endsWith('?')) problems.push(`${comment.id}: "${sentence}"`);
              // ... and a file only in the message it comes with.
              if (/attach/i.test(sentence) && !sentence.includes('attached to this message')) problems.push(`${comment.id}: "${sentence}"`);
            }
          });
        }
        expect(problems).toEqual([]);
        expect(customerAttachments).toBeGreaterThan(300);
      });

      it('the question comes before the proposal, each at most once, and the resolution is the one proposed', () => {
        const problems: string[] = [];
        let proposedAndResolved = 0;
        for (const thread of all) {
          const employee = thread.comments.filter((comment) => comment.authorKind === 'employee');
          const proposals = employee.filter((comment) => CONFIRM.test(comment.text));
          const questions = employee.filter((comment) => asks(comment.text) && !CONFIRM.test(comment.text));
          if (proposals.length > 1 || questions.length > 1) problems.push(`${thread.id}: ${questions.length} questions, ${proposals.length} proposals`);
          if (proposals.length === 1 && questions.length === 1 && proposals[0]!.postedAt < questions[0]!.postedAt) problems.push(`${thread.id}: asks after proposing`);
          if (thread.status !== 'resolved' && thread.status !== 'closed') continue;
          const resolution = solutionWords(thread.comments[thread.comments.length - 1]!.text);
          if (resolution === '') problems.push(`${thread.id}: the last message carries no solution`);
          if (proposals.length === 1) {
            proposedAndResolved++;
            if (solutionWords(proposals[0]!.text) !== resolution) problems.push(`${thread.id}: proposed "${solutionWords(proposals[0]!.text)}", resolved "${resolution}"`);
          }
        }
        expect(problems).toEqual([]);
        expect(proposedAndResolved).toBeGreaterThan(500);
      });

      it('never repeats a sentence within a thread', () => {
        const problems: string[] = [];
        for (const thread of all) {
          const seen = new Set<string>();
          for (const comment of thread.comments) {
            for (const sentence of sentences(comment.text)) {
              if (seen.has(sentence)) problems.push(`${comment.id}: "${sentence}"`);
              seen.add(sentence);
            }
          }
        }
        expect(problems).toEqual([]);
      });
    });

    it('commentCount has the parity of its status: 0 or 1 (new), odd (open), even (pending, resolved, closed)', () => {
      const problems: string[] = [];
      for (const supportCase of cases) {
        const odd = supportCase.commentCount % 2 === 1;
        if (supportCase.status === 'open' && !odd) problems.push(`${supportCase.id}: open with ${supportCase.commentCount}`);
        if ((supportCase.status === 'pending' || supportCase.status === 'resolved' || supportCase.status === 'closed') && (odd || supportCase.commentCount < 2)) {
          problems.push(`${supportCase.id}: ${supportCase.status} with ${supportCase.commentCount}`);
        }
        if (supportCase.status === 'new' && supportCase.commentCount > 1) problems.push(`${supportCase.id}: new with ${supportCase.commentCount}`);
      }
      expect(problems).toEqual([]);
    });
  });

  it('has a new case that is assigned and one that is not, among the first rows', () => {
    const fresh = makeSupportCases(100).filter((supportCase) => supportCase.status === 'new');
    expect(fresh.some((supportCase) => supportCase.assigneeId !== null)).toBe(true);
    expect(fresh.some((supportCase) => supportCase.assigneeId === null)).toBe(true);
  });

  it('has unassigned cases (new ones only) and the customer writes first in every thread', () => {
    expect(makeSupportCases(50).some((supportCase) => supportCase.assigneeId === null)).toBe(true);
    for (const supportCase of cases.slice(0, 1500)) {
      const [first] = getSupportCase(supportCase.id)!.comments;
      if (first) expect(first.authorKind).toBe('customer');
    }
  });

  it('shows every status and every priority within the first 50 rows', () => {
    const first = makeSupportCases(50);
    expect(new Set(first.map((supportCase) => supportCase.status))).toEqual(new Set(Object.keys(SUPPORT_CASE_STATUS_LABEL)));
    expect(new Set(first.map((supportCase) => supportCase.priority))).toEqual(new Set(Object.keys(SUPPORT_CASE_PRIORITY_LABEL)));
  });

  it('the detail of an id is always the same', () => {
    const detail = getSupportCase('cs-3')!;
    expect(getSupportCase('cs-3')).toBe(detail);
    expect(detail.comments.length).toBe(makeSupportCases(3)[2]!.commentCount);
  });
});

describe('referential integrity across every domain (n = 5,000)', () => {
  const N = 5000;
  const customerIds = new Set(makeCustomers(DEMO_REFERENCE_POOL.customers).map((c) => c.id));
  const supplierIds = new Set(suppliers.map((s) => s.id));
  const productIds = new Set(products.map((p) => p.id));
  const employeeIds = new Set(employees.map((e) => e.id));

  it('leaves no orphan id', () => {
    const orphans: string[] = [];
    const check = (owner: string, ids: Set<string>, id: string | null) => {
      if (id !== null && !ids.has(id)) orphans.push(`${owner} -> ${id}`);
    };
    const salesOrderIds = new Set<string>();
    for (const order of makeSalesOrders(N)) {
      salesOrderIds.add(order.id);
      check(order.id, customerIds, order.customerId);
      check(order.id, employeeIds, order.accountManagerId);
      for (const line of getSalesOrder(order.id)!.lines) check(line.id, productIds, line.productId);
    }
    for (const order of makePurchaseOrders(N)) {
      check(order.id, supplierIds, order.supplierId);
      check(order.id, employeeIds, order.buyerId);
      for (const line of getPurchaseOrder(order.id)!.lines) check(line.id, productIds, line.productId);
    }
    const invoicedOrders = new Set(makeSalesOrders(20_000).filter((o) => o.status === 'invoiced').map((o) => o.id));
    for (const invoice of makeInvoices(N)) {
      check(invoice.id, customerIds, invoice.customerId);
      check(invoice.id, invoicedOrders, invoice.salesOrderId);
    }
    for (const supportCase of makeSupportCases(N)) {
      check(supportCase.id, customerIds, supportCase.customerId);
      check(supportCase.id, productIds, supportCase.productId);
      check(supportCase.id, employeeIds, supportCase.assigneeId);
      for (const comment of getSupportCase(supportCase.id)!.comments) if (comment.authorKind === 'employee') check(comment.id, employeeIds, comment.authorId);
    }
    expect(orphans).toEqual([]);
    expect(salesOrderIds.size).toBe(N);
  });

  it('a small story can load the complete pools and resolve every reference', () => {
    // 20 orders, every customer they name is among the first DEMO_REFERENCE_POOL.customers.
    const small = makeSalesOrders(20);
    for (const order of small) expect(customerIds.has(order.customerId)).toBe(true);
  });
});

describe('invalid counts and unknown ids', () => {
  const makers = [makeSalesOrders, makePurchaseOrders, makeInvoices, makeSupportCases];
  it.each([-1, 1.5, Number.NaN])('every maker throws on n = %s', (n) => {
    for (const make of makers) expect(() => make(n)).toThrow(RangeError);
  });
  it('n = 0 is [] and n = 1 is one row', () => {
    for (const make of makers) {
      expect(make(0)).toEqual([]);
      expect(make(1)).toHaveLength(1);
    }
  });
  it('malformed ids are undefined', () => {
    for (const get of [getSalesOrder, getPurchaseOrder, getInvoice, getSupportCase] as ((id: string) => unknown)[]) {
      for (const bad of ['', 'so-0', 'po-01', 'inv-1.5', 'cs-x', 'cus-1']) expect(get(bad)).toBeUndefined();
    }
  });
  it('details are deeply frozen', () => {
    const order = getSalesOrder('so-3')!;
    expect(Object.isFrozen(order) && Object.isFrozen(order.lines) && Object.isFrozen(order.lines[0])).toBe(true);
    const supportCase = getSupportCase('cs-3')!;
    expect(Object.isFrozen(supportCase.comments) && Object.isFrozen(supportCase.comments[0])).toBe(true);
    expect(() => {
      (order.lines[0] as { quantity: number }).quantity = 99;
    }).toThrow(TypeError);
  });
});
