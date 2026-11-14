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
      if (order.number !== `SO-${order.orderDate.slice(0, 4)}-${10001 + Number(order.id.slice(3)) - 1}`) problems.push(`${order.id}: number ${order.number}`);
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
      if (order.number !== `PO-${order.orderDate.slice(0, 4)}-${10001 + Number(order.id.slice(3)) - 1}`) problems.push(`${order.id}: number`);
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
      if (daysBetween(orderById.get(invoice.salesOrderId)!.orderDate, invoice.issueDate) < 2) problems.push(`${invoice.id}: issued too early`);
      if (daysBetween(invoice.issueDate, DEMO_TODAY) < 0) problems.push(`${invoice.id}: issued in the future`);
      if (invoice.number !== `INV-${invoice.issueDate.slice(0, 4)}-${10001 + Number(invoice.id.slice(4)) - 1}`) problems.push(`${invoice.id}: number`);
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

  it('has cases without comments, and long comments (to exercise truncation)', () => {
    expect(cases.some((supportCase) => supportCase.commentCount === 0)).toBe(true);
    expect(cases.filter((supportCase) => supportCase.commentCount === 0).every((supportCase) => supportCase.status === 'new')).toBe(true);
    const lengths = cases.slice(0, 1500).flatMap((supportCase) => getSupportCase(supportCase.id)!.comments.map((comment) => comment.text.length));
    expect(Math.max(...lengths)).toBeGreaterThan(400);
    expect(Math.min(...lengths)).toBeLessThan(200);
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
