// #583: the simulated server changes of the sales orders are idempotent. The store applies an update that lands
// during a save twice: once on the order it holds (what it announces), then again on top of what the save wrote. The
// second application must write what the first one announced (absolute values, lines by id), never values derived
// from the user's (their delivery plus a week, another product under `srv-line-1`, a second added line).
import { describe, expect, it } from 'vitest';
import { DEMO_REFERENCE_POOL, makeProducts } from '../../../core/src/internal/demo-data';
import type { RecordServerChange } from '../../../core/src/showcase/record-store';
import { createSalesOrderStore, makeShowcaseSalesOrders, type StoredSalesOrder } from '../../../core/src/showcase/sales-order-store';
import { DELIVERY_SHIFT_DAYS, NEXT_STATUS, serverChangeOf, serverLineIds } from './sales-order-rebase';

const ORDERS = makeShowcaseSalesOrders();
/** so-1: EUR, invoiced, delivery 2026-06-10, 3 lines (quantities 1, 50, 10). */
const SO1 = ORDERS.find((o) => o.id === 'so-1')!;
/** The product the server adds to so-1: the first active one of the catalogue the order does not have. */
const FIRST_FREE_PRODUCT = makeProducts(DEMO_REFERENCE_POOL.products).find((p) => p.status === 'active' && !SO1.lines.some((l) => l.productId === p.id))!;

/** A promise the test resolves itself: holds a save in flight until `release()`. */
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('serverChangeOf: the first application fixes the values, a later one writes the same (#583)', () => {
  it('status and delivery: applied again on an order with another delivery and status, the server\'s values, not the user\'s plus a week', () => {
    const change = serverChangeOf('status-and-delivery');
    const announced = change(SO1);
    expect(announced).toMatchObject({ status: 'shipped', requestedDeliveryDate: '2026-06-17' });
    // What the user saved meanwhile: a delivery the server never had, another status.
    const mine: StoredSalesOrder = { ...SO1, status: 'draft', requestedDeliveryDate: '2026-09-03', notes: 'Mine' };
    const replayed = change(mine);
    expect(replayed).toEqual({ ...mine, status: 'shipped', requestedDeliveryDate: '2026-06-17' });
    // Not the relative change of the user's values (a delivery nobody chose: 2026-09-10; `NEXT_STATUS.draft`).
    expect(replayed.requestedDeliveryDate).not.toBe('2026-09-10');
    expect(NEXT_STATUS.draft).not.toBe('shipped');
    expect(replayed.status).not.toBe(NEXT_STATUS.draft);
    expect(change(change(mine))).toEqual(replayed);
  });

  it('line 1 quantity: the line the server changed, by id, with the server\'s quantity plus one, wherever it is now', () => {
    const change = serverChangeOf('line-1-quantity');
    const [first, second, third] = SO1.lines;
    expect(change(SO1).lines.map((l) => l.quantity)).toEqual([first!.quantity + 1, second!.quantity, third!.quantity]);
    // The user typed 9 on that line and moved it last: the replay sets the server's quantity on THAT line only.
    const mine: StoredSalesOrder = { ...SO1, lines: [second!, third!, { ...first!, quantity: 9 }] };
    expect(change(mine).lines.map((l) => [l.id, l.quantity])).toEqual([
      [second!.id, second!.quantity],
      [third!.id, third!.quantity],
      [first!.id, first!.quantity + 1],
    ]);
    // The line is gone from what the user saved: nothing to set, no other line touched.
    const without: StoredSalesOrder = { ...SO1, lines: [second!, third!] };
    expect(change(without)).toEqual(without);
  });

  it('line 1 removed: the line the server removed, by id, not whatever line is first now', () => {
    const change = serverChangeOf('remove-line-1');
    const [first, second, third] = SO1.lines;
    expect(change(SO1).lines.map((l) => l.id)).toEqual([second!.id, third!.id]);
    const mine: StoredSalesOrder = { ...SO1, lines: [third!, first!, second!] };
    expect(change(mine).lines.map((l) => l.id)).toEqual([third!.id, second!.id]);
  });

  it('a line added: the announced product under the announced id, also on an order that now holds that product; never twice', () => {
    let issued = 0;
    const change = serverChangeOf('add-line', () => `srv-line-${(issued += 1)}`);
    const announced = change(SO1).lines.at(-1)!;
    expect(announced).toMatchObject({ id: 'srv-line-1', productId: FIRST_FREE_PRODUCT.id, quantity: 1, discountPercent: 0 });
    // The user saved a line of that very product meanwhile: recomputing the product would pick ANOTHER one.
    const mine: StoredSalesOrder = { ...SO1, lines: [...SO1.lines, { id: 'new-1', productId: FIRST_FREE_PRODUCT.id, quantity: 2, unitPriceMinor: 100, discountPercent: 0 }] };
    const replayed = change(mine);
    expect(replayed.lines.map((l) => l.id)).toEqual([...SO1.lines.map((l) => l.id), 'new-1', 'srv-line-1']);
    expect(replayed.lines.at(-1)).toEqual(announced);
    // One id issued for the update, whatever the number of applications; an order that has the line already keeps one.
    expect(issued).toBe(1);
    expect(change(replayed)).toEqual(replayed);
    // The line written is a copy: changing what a call returned never changes the next one.
    replayed.lines.at(-1)!.quantity = 99;
    expect(change(mine).lines.at(-1)!.quantity).toBe(1);
  });

  it('two updates in a row without a save (two clicks): each from the order of its time, so they add up', () => {
    const once = serverChangeOf('status-and-delivery')(SO1);
    const twice = serverChangeOf('status-and-delivery')(once);
    expect(twice).toMatchObject({ status: NEXT_STATUS[NEXT_STATUS.invoiced], requestedDeliveryDate: '2026-06-24' });
    expect(DELIVERY_SHIFT_DAYS * 2).toBe(14);
    const quantity = serverChangeOf('line-1-quantity');
    expect(serverChangeOf('line-1-quantity')(quantity(SO1)).lines[0]!.quantity).toBe(SO1.lines[0]!.quantity + 2);
    const ids = serverLineIds({});
    const added = serverChangeOf('add-line', ids)(serverChangeOf('add-line', ids)(SO1));
    expect(added.lines.slice(-2).map((l) => l.id)).toEqual(['srv-line-1', 'srv-line-2']);
    expect(new Set(added.lines.map((l) => l.productId)).size).toBe(added.lines.length);
  });
});

describe('the store replays an update that landed during a save: what it holds is what it announced (#583)', () => {
  /** A store whose saves wait for the gate, the server changes it announces, and so-1 as the user saves it. */
  function setup() {
    const held = gate();
    const store = createSalesOrderStore(undefined, { saveDelayMs: held.promise });
    const announced: RecordServerChange<StoredSalesOrder>[] = [];
    store.subscribe((change) => announced.push(change));
    return { held, store, announced };
  }

  it('status and delivery during a save of another delivery: the stored order has the announced delivery, never one nobody chose', async () => {
    const { held, store, announced } = setup();
    const saving = store.save({ ...SO1, requestedDeliveryDate: '2026-09-03', customerReference: 'PO-9' });
    await store.updateFromServer('so-1', serverChangeOf('status-and-delivery'));
    expect(announced.at(-1)!.record).toMatchObject({ status: 'shipped', requestedDeliveryDate: '2026-06-17' });
    held.release();
    // The save answers with what it wrote; the store then holds the update on top, and announces it.
    expect(await saving).toMatchObject({ requestedDeliveryDate: '2026-09-03', customerReference: 'PO-9' });
    const stored = store.snapshot().find((o) => o.id === 'so-1')!;
    expect(stored).toMatchObject({ status: 'shipped', requestedDeliveryDate: '2026-06-17', customerReference: 'PO-9' });
    expect(announced.at(-1)!.record).toEqual(stored);
  });

  it('a line added during a save that adds the same product: srv-line-1 keeps the announced product, once', async () => {
    const { held, store, announced } = setup();
    const ids = serverLineIds(store);
    const saving = store.save({ ...SO1, lines: [...SO1.lines, { id: 'new-1', productId: FIRST_FREE_PRODUCT.id, quantity: 2, unitPriceMinor: 100, discountPercent: 0 }] });
    await store.updateFromServer('so-1', serverChangeOf('add-line', ids));
    const first = announced.at(-1)!.record!.lines.find((l) => l.id === 'srv-line-1')!;
    expect(first.productId).toBe(FIRST_FREE_PRODUCT.id);
    held.release();
    await saving;
    const lines = store.snapshot().find((o) => o.id === 'so-1')!.lines;
    expect(lines.filter((l) => l.id === 'srv-line-1')).toEqual([first]);
    expect(lines.map((l) => l.id)).toEqual([...SO1.lines.map((l) => l.id), 'new-1', 'srv-line-1']);
    expect(announced.at(-1)!.record!.lines).toEqual(lines);
  });

  it('line 1 quantity during a save that changed it: the stored quantity is the announced one, not the user\'s plus one', async () => {
    const { held, store, announced } = setup();
    const saving = store.save({ ...SO1, lines: SO1.lines.map((l, i) => (i === 0 ? { ...l, quantity: 9 } : l)) });
    await store.updateFromServer('so-1', serverChangeOf('line-1-quantity'));
    expect(announced.at(-1)!.record!.lines[0]!.quantity).toBe(SO1.lines[0]!.quantity + 1);
    held.release();
    await saving;
    expect(store.snapshot().find((o) => o.id === 'so-1')!.lines[0]!.quantity).toBe(SO1.lines[0]!.quantity + 1);
  });
});
