import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SALES_ORDERS, SALES_ORDERS_CRUD, type SalesOrderValues } from './modules/sales-orders/sales-orders-module';
import { RecordEditor, type UseRecordEditorAddons } from './RecordPageShell';
import { createSalesOrderStore, type SalesOrderDraft, type StoredSalesOrder } from './sales-order-store';

// #527: the story-only `useAddons` extension point of the editor (#384, #470), tested on a sales order. The cases come
// from the tests of the invoices' editor (`InvoiceEditor`), which went with the invoices' showcase: the shell is the same.
type UseAddons = UseRecordEditorAddons<StoredSalesOrder, SalesOrderValues, SalesOrderDraft>;

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
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('RecordEditor: the story-only useAddons extension point (#384, #527)', () => {
  // An add-on with state of its own: swapping it for another hook under a mounted editor would break the order of
  // the hooks (React throws).
  const useCounterAddons: UseAddons = () => {
    const [count] = useState(1);
    return { notice: <p>{`addon ${count}`}</p> };
  };

  it('the hook chosen at mount is kept for the life of the editor; a change of the prop warns in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = createSalesOrderStore();
    const record = await store.get('so-15');
    const ui = (useAddons: UseAddons | undefined) => (
      <RecordEditor module={SALES_ORDERS} store={store} record={record} onBack={vi.fn()} focusTitleOnMount={false} useAddons={useAddons} />
    );
    const view = render(ui(useCounterAddons));
    expect(screen.getByText('addon 1')).toBeTruthy();
    view.rerender(ui(undefined));
    // Still the add-on of the mount: no hook-order error, the notice still there.
    expect(screen.getByText('addon 1')).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('useAddons changed'));
    warn.mockRestore();
  });

  it('#470: an add-on that reads scrollerRef.current during its render gets null before the first commit (no ReferenceError), the scroller after it', async () => {
    const store = createSalesOrderStore();
    const record = await store.get('so-15');
    const seen: (HTMLElement | null)[] = [];
    const useReadingAddons: UseAddons = ({ scrollerRef }) => {
      seen.push(scrollerRef.current);
      return {};
    };
    const ui = () => (
      <RecordEditor module={SALES_ORDERS} store={store} record={record} onBack={vi.fn()} focusTitleOnMount={false} useAddons={useReadingAddons} />
    );
    const view = render(ui());
    expect(seen[0]).toBeNull();
    view.rerender(ui());
    expect(seen.at(-1)).toBe(document.querySelector('[data-object-page-scroller]'));
    expect(seen.at(-1)).not.toBeNull();
  });

  it('a creation (no record) never calls the add-on hook', () => {
    const addon = vi.fn(() => ({}));
    render(
      <RecordEditor
        module={SALES_ORDERS_CRUD}
        store={createSalesOrderStore()}
        record={null}
        onBack={vi.fn()}
        focusTitleOnMount={false}
        today="2026-11-09"
        useAddons={addon}
      />,
    );
    expect(addon).not.toHaveBeenCalled();
  });
});
