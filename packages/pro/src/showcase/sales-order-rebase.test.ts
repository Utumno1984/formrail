// #522: the simulated server changes of the sales orders and the merge of a server version into an edited order
// (computeRebase with the options of the add-on), as pure functions. Fast: no React.
import { describe, expect, it } from 'vitest';
import { SALES_ORDERS } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';
import { createSalesOrderStore, makeShowcaseSalesOrders, type StoredSalesOrder } from '../../../core/src/showcase/sales-order-store';
import { DEMO_REFERENCE_POOL, makeProducts } from '../../../core/src/internal/demo-data';
import { computeRebase } from '../form-rebase/compute-rebase';
import { SALES_ORDER_ARRAY_ID_KEYS, SALES_ORDER_LABELS, salesOrderEngine, salesOrderLineLabel } from './sales-order-review';
import { DELIVERY_SHIFT_DAYS, NEXT_STATUS, SALES_ORDER_SERVER_CHANGES, serverChangeOf, serverLineIds } from './sales-order-rebase';

const ORDERS = makeShowcaseSalesOrders();
const order = (id: string): StoredSalesOrder => ORDERS.find((o) => o.id === id)!;
const { toValues } = SALES_ORDERS.form;
const rebase = (baseline: StoredSalesOrder, values: ReturnType<typeof toValues>, incoming: StoredSalesOrder) =>
  computeRebase({
    baseline: toValues(baseline),
    values,
    incoming: toValues(incoming),
    arrayIdKeys: SALES_ORDER_ARRAY_ID_KEYS,
    labels: SALES_ORDER_LABELS,
    isEqual: salesOrderEngine(baseline.currency).isEqual,
    itemLabel: salesOrderLineLabel,
  });

describe('the server changes of the story', () => {
  it('the Control offers at least status and delivery, line 1 quantity, line 1 removed, the order deleted (and a line added)', () => {
    expect(SALES_ORDER_SERVER_CHANGES).toEqual(['status-and-delivery', 'line-1-quantity', 'remove-line-1', 'add-line', 'delete-order']);
  });

  it('status and delivery: the next status, the delivery a week later (across a month), nothing else', () => {
    const so1 = order('so-1');
    const changed = serverChangeOf('status-and-delivery')(so1);
    expect(changed).toEqual({ ...so1, status: 'shipped', requestedDeliveryDate: '2026-06-17' });
    expect(serverChangeOf('status-and-delivery')({ ...so1, requestedDeliveryDate: '2026-12-28' }).requestedDeliveryDate).toBe('2027-01-04');
    expect(DELIVERY_SHIFT_DAYS).toBe(7);
  });

  it('the next status is never "cancelled" (the page would turn read-only under the user); a cancelled order stays cancelled', () => {
    for (const [from, to] of Object.entries(NEXT_STATUS)) {
      if (from === 'cancelled') expect(to).toBe('cancelled');
      else {
        expect(to).not.toBe('cancelled');
        expect(to).not.toBe(from);
      }
    }
  });

  it('line 1 quantity + 1, line 1 removed: the other lines untouched', () => {
    const so1 = order('so-1');
    expect(serverChangeOf('line-1-quantity')(so1).lines.map((l) => l.quantity)).toEqual([2, 50, 10]);
    expect(serverChangeOf('remove-line-1')(so1).lines.map((l) => l.id)).toEqual(['so-1-line-2', 'so-1-line-3']);
    expect(serverChangeOf('line-1-quantity')(so1).lines.slice(1)).toEqual(so1.lines.slice(1));
  });

  it('a line added: a product the order does not have, quantity 1, its list price in the order\'s currency, the id the server issues', () => {
    const so13 = order('so-13');
    const added = serverChangeOf('add-line', () => 'srv-line-9')(so13).lines.at(-1)!;
    expect(added).toMatchObject({ id: 'srv-line-9', quantity: 1, discountPercent: 0 });
    expect(so13.lines.map((l) => l.productId)).not.toContain(added.productId);
    expect(added.unitPriceMinor).toBeGreaterThan(0);
    expect(() => serverChangeOf('add-line')(so13)).toThrow(/needs a line id/);
  });

  it('a line added: never a product the order already has, even the first active one of the catalogue', () => {
    const active = makeProducts(DEMO_REFERENCE_POOL.products).filter((p) => p.status === 'active');
    const so13 = order('so-13');
    // The order holds the first two active products: the added line must be a third one.
    const withFirst: StoredSalesOrder = {
      ...so13,
      lines: [{ ...so13.lines[0]!, productId: active[0]!.id }, { ...so13.lines[0]!, id: 'so-13-line-x', productId: active[1]!.id }],
    };
    const added = serverChangeOf('add-line', () => 'srv-line-1')(withFirst).lines.at(-1)!;
    expect(added.productId).toBe(active[2]!.id);
  });

  it('a line added: never a discontinued product; with every active product already on the order there is none left', () => {
    const all = makeProducts(DEMO_REFERENCE_POOL.products);
    expect(all.some((p) => p.status !== 'active')).toBe(true);
    const so13 = order('so-13');
    const holdingAllActive: StoredSalesOrder = {
      ...so13,
      lines: all.filter((p) => p.status === 'active').map((p, i) => ({ ...so13.lines[0]!, id: `so-13-held-${i}`, productId: p.id })),
    };
    expect(() => serverChangeOf('add-line', () => 'srv-line-1')(holdingAllActive)).toThrow(/no product left/);
  });

  it('server line ids: one sequence per store, never reused, never in the client\'s `new-<n>` space', () => {
    const a = createSalesOrderStore();
    const b = createSalesOrderStore();
    const nextA = serverLineIds(a);
    expect([nextA(), nextA(), serverLineIds(a)()]).toEqual(['srv-line-1', 'srv-line-2', 'srv-line-3']);
    expect(serverLineIds(b)()).toBe('srv-line-1');
  });
});

describe('a server version merged into the order (computeRebase with the add-on\'s options)', () => {
  it('no edit: the result is the server version itself, nothing to apply by hand, no conflict (no echo)', () => {
    const so1 = order('so-1');
    const incoming = serverChangeOf('status-and-delivery')(so1);
    const result = rebase(so1, toValues(so1), incoming);
    expect(result.values).toBe(result.baseline);
    expect(result.conflicts).toEqual([]);
    expect(result.applied.map((e) => e.label)).toEqual(['Status', 'Requested delivery']);
  });

  it('a quantity typed as "01" (the same number): not touched, so the server\'s quantity is taken without a conflict', () => {
    const so1 = order('so-1');
    const values = toValues(so1);
    const typed = { ...values, lines: values.lines.map((l, i) => (i === 0 ? { ...l, quantity: `0${l.quantity}` } : l)) };
    const result = rebase(so1, typed, serverChangeOf('line-1-quantity')(so1));
    expect(result.conflicts).toEqual([]);
    expect(result.values.lines[0]!.quantity).toBe('2');
  });

  it('a line added by the user and one by the server: both kept, the server\'s first (after its predecessor), no conflict', () => {
    const so1 = order('so-1');
    const values = toValues(so1);
    const mine = { id: 'new-1', productId: values.lines[0]!.productId, quantity: '3', unitPrice: '1.00', discount: '0' };
    const result = rebase(so1, { ...values, lines: [...values.lines, mine] }, serverChangeOf('add-line', () => 'srv-line-1')(so1));
    expect(result.values.lines.map((l) => l.id)).toEqual(['so-1-line-1', 'so-1-line-2', 'so-1-line-3', 'srv-line-1', 'new-1']);
    expect(result.conflicts).toEqual([]);
  });

  it('the line the server removed and the user edited: kept, one conflict on the row named by its product', () => {
    const so1 = order('so-1');
    const values = toValues(so1);
    const edited = { ...values, lines: values.lines.map((l, i) => (i === 0 ? { ...l, quantity: '7' } : l)) };
    const result = rebase(so1, edited, serverChangeOf('remove-line-1')(so1));
    expect(result.conflicts.map((c) => [c.path, c.label, c.theirsMissing])).toEqual([['lines.0', 'Lines > Line 1 (Pneumatic cylinder ⌀32 × 200 mm)', true]]);
    expect(result.values.lines).toHaveLength(3);
  });
});
