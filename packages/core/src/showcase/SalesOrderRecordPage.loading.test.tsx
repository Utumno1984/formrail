import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SALES_ORDERS } from './modules/sales-orders/sales-orders-module';
import { RecordPage } from './RecordPageShell';
import { createSalesOrderStore, type SalesOrderStore, type StoredSalesOrder } from './sales-order-store';

// #527: cases of the record page that only the removed showcase tested (see the table in the pull request), ported
// to the sales orders: the live region of the load, a response for a record that is no longer the one asked for, and
// the number texts a quantity refuses. so-15: EUR, confirmed, 2 lines; so-42: JPY, confirmed.
const CONFIRMED = 'so-15';
const JPY = 'so-42';

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  // jsdom has no scrollIntoView (a failed Save moves the focus to the first invalid field).
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function setup(config: Parameters<typeof createSalesOrderStore>[1] = {}, recordId = CONFIRMED) {
  const store = createSalesOrderStore(undefined, config);
  const onBack = vi.fn();
  const onSaved = vi.fn();
  render(<RecordPage module={SALES_ORDERS} store={store} recordId={recordId} onBack={onBack} onSaved={onSaved} />);
  return { store, onBack, onSaved };
}

// jsdom loads no CSS: a hidden footer is still in the tree, but `inert`.
const visibleBar = () =>
  waitFor(() => {
    const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
    expect(el && !el.hasAttribute('inert') ? el : null).not.toBeNull();
    return el!;
  });
const quantity = (n: number) => screen.findByRole('textbox', { name: `Line ${n} quantity` });
const stored = (store: SalesOrderStore, id: string): StoredSalesOrder => store.snapshot().find((o) => o.id === id)!;
const title = () => screen.getByRole('heading', { level: 1 });

describe('SalesOrderRecordPage: the load (#527)', () => {
  it('announces the loading and the arrival in one live region that is always mounted', async () => {
    setup({ loadDelayMs: 30 });
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Loading sales order');
    await quantity(1);
    // The same node: a region inserted (or re-inserted) already filled may be skipped by a screen reader.
    expect(region).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toContain(region);
    expect(region).toHaveTextContent(/^Sales order SO-2026-\d{9} loaded$/);
  });

  it('an in-flight response for a superseded record is dropped', async () => {
    const store = createSalesOrderStore(undefined, { loadDelayMs: 100 });
    const onBack = vi.fn();
    const view = render(<RecordPage module={SALES_ORDERS} store={store} recordId={CONFIRMED} onBack={onBack} />);
    store.configure({ loadDelayMs: 10 });
    view.rerender(<RecordPage module={SALES_ORDERS} store={store} recordId={JPY} onBack={onBack} />);
    const wanted = stored(store, JPY);
    const first = await quantity(1);
    expect(title()).toHaveTextContent(wanted.number);
    expect(first).toHaveValue(String(wanted.lines[0]!.quantity));
    // The response for so-15 lands now (100 ms): the page stays on so-42.
    await new Promise((r) => setTimeout(r, 150));
    expect(title()).toHaveTextContent(wanted.number);
    expect(title()).not.toHaveTextContent(stored(store, CONFIRMED).number);
    expect(screen.getByRole('textbox', { name: 'Line 1 quantity' })).toHaveValue(String(wanted.lines[0]!.quantity));
  });

  it('another record asked for after a load: "Loading" until it arrives, never the editor of the previous one', async () => {
    const store = createSalesOrderStore(undefined, { loadDelayMs: 0 });
    const onBack = vi.fn();
    const view = render(<RecordPage module={SALES_ORDERS} store={store} recordId={CONFIRMED} onBack={onBack} />);
    await quantity(1);
    expect(title()).toHaveTextContent(stored(store, CONFIRMED).number);
    store.configure({ loadDelayMs: 50 });
    view.rerender(<RecordPage module={SALES_ORDERS} store={store} recordId={JPY} onBack={onBack} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading sales order');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    await quantity(1);
    expect(title()).toHaveTextContent(stored(store, JPY).number);
  });
});

describe('SalesOrderRecordPage: the quantity refuses what is not a whole number (#527)', () => {
  it.each(['0x1F', '1e3', '-5', 'abc', '', '0'])('rejects the quantity %j', async (typed) => {
    const { onSaved, store } = setup();
    const field = await quantity(1);
    const saved = stored(store, CONFIRMED).lines[0]!.quantity;
    await userEvent.clear(field);
    if (typed) await userEvent.type(field, typed);
    expect(field).toHaveValue(typed);
    await userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/^Quantity must be a whole number from 1 to 99,999/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(stored(store, CONFIRMED).lines[0]!.quantity).toBe(saved);
  });
});
