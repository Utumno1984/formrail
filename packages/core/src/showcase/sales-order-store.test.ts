import { describe, expect, it } from 'vitest';
import { createSalesOrderStore, linesTotalMinor, makeShowcaseSalesOrders } from './sales-order-store';

describe('the sales order store (#520)', () => {
  it('seeds 200 orders of the demo universe, each with its lines and a total equal to their sum', () => {
    const orders = makeShowcaseSalesOrders();
    expect(orders).toHaveLength(200);
    expect(new Set(orders.map((o) => o.id)).size).toBe(200);
    for (const order of orders) {
      expect(order.lines.length).toBeGreaterThanOrEqual(1);
      expect(order.totalMinor).toBe(linesTotalMinor(order.lines));
      expect(order.customerName).not.toBe('');
      expect(order.requestedDeliveryDate >= order.orderDate).toBe(true);
    }
  });

  it('the seed has the special orders the showcase relies on', () => {
    const orders = makeShowcaseSalesOrders();
    const by = (id: string) => orders.find((o) => o.id === id)!;
    expect(by('so-28').status).toBe('cancelled');
    expect(by('so-42').currency).toBe('JPY');
    expect(by('so-27').lines).toHaveLength(18);
    expect(by('so-15').status).toBe('confirmed');
  });

  it('a save derives the total from the lines the client sent, whatever total it carries', async () => {
    const store = createSalesOrderStore();
    const order = await store.get('so-15');
    const saved = await store.save({
      ...order,
      totalMinor: 1,
      lines: order.lines.map((l, i) => (i === 0 ? { ...l, quantity: l.quantity + 1 } : l)),
    });
    expect(saved.totalMinor).toBe(linesTotalMinor(saved.lines));
    expect(saved.totalMinor).not.toBe(order.totalMinor);
    expect((await store.list()).find((o) => o.id === 'so-15')!.totalMinor).toBe(saved.totalMinor);
  });

  it('a stored order cannot be changed from outside: the store copies the lines in and out', async () => {
    const store = createSalesOrderStore();
    const first = await store.get('so-15');
    first.lines[0]!.quantity = 9999;
    expect((await store.get('so-15')).lines[0]!.quantity).not.toBe(9999);
  });

  it('a failed save leaves the store unchanged; `error-once` fails the first read only', async () => {
    const failing = createSalesOrderStore(undefined, { saveOutcome: 'error' });
    const order = await failing.get('so-15');
    await expect(failing.save({ ...order, notes: 'x' })).rejects.toThrow(/Could not save the sales order/);
    expect((await failing.get('so-15')).notes).toBe(order.notes);

    const once = createSalesOrderStore(undefined, { loadOutcome: 'error-once' });
    await expect(once.get('so-15')).rejects.toThrow();
    await expect(once.get('so-15')).resolves.toMatchObject({ id: 'so-15' });
  });

  it('an unknown id is "not found" in the words of the module', async () => {
    await expect(createSalesOrderStore().get('so-9999')).rejects.toThrow('Sales order "so-9999" not found');
  });
});
