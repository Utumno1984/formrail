// @vitest-environment node
// Lists never generate the lines of an order nor the comments of a case: only `getSalesOrder(id)`,
// `getPurchaseOrder(id)` and `getSupportCase(id)` do (ticket #514). The line and comment builders are
// spied on, so "lazy" is observed, not inferred from a missing key.
import * as orderLines from './order-lines';
import * as employees from './employees';

vi.mock('./order-lines', async (importOriginal) => {
  const original = await importOriginal<typeof import('./order-lines')>();
  return { ...original, buildLines: vi.fn(original.buildLines) };
});
vi.mock('./employees', async (importOriginal) => {
  const original = await importOriginal<typeof import('./employees')>();
  return { ...original, getEmployee: vi.fn(original.getEmployee) };
});

const buildLines = vi.mocked(orderLines.buildLines);
const getEmployee = vi.mocked(employees.getEmployee);

beforeEach(() => {
  buildLines.mockClear();
  getEmployee.mockClear();
});

describe('lazy detail', () => {
  it('lists of orders and invoices build no lines, and rows carry no `lines`', async () => {
    const { makeSalesOrders, makePurchaseOrders, makeInvoices } = await import('./index');
    const sales = makeSalesOrders(3000);
    const purchases = makePurchaseOrders(3000);
    makeInvoices(1000);
    expect(buildLines).not.toHaveBeenCalled();
    expect('lines' in sales[0]!).toBe(false);
    expect('lines' in purchases[0]!).toBe(false);
  });

  it('getSalesOrder / getPurchaseOrder build the lines of that one order, once', async () => {
    const { getSalesOrder, getPurchaseOrder } = await import('./index');
    const order = getSalesOrder('so-4001')!;
    expect(buildLines).toHaveBeenCalledTimes(1);
    expect(getSalesOrder('so-4001')).toBe(order);
    expect(buildLines).toHaveBeenCalledTimes(1);
    getPurchaseOrder('po-4001');
    expect(buildLines).toHaveBeenCalledTimes(2);
  });

  it('a case list builds no comments (nobody resolves the assignee), a detail does', async () => {
    const { makeSupportCases, getSupportCase } = await import('./index');
    const cases = makeSupportCases(3000);
    expect(getEmployee).not.toHaveBeenCalled();
    expect('comments' in cases[0]!).toBe(false);
    const assigned = cases.find((c) => c.assigneeId !== null && c.commentCount > 1)!;
    const detail = getSupportCase(assigned.id)!;
    expect(getEmployee).toHaveBeenCalledWith(assigned.assigneeId);
    expect(detail.comments).toHaveLength(assigned.commentCount);
  });
});
