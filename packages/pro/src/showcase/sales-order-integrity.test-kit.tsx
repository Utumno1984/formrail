// #522: what the RTL tests of `Pro/Showcase/Record editing integrity` on the sales orders share: the jsdom shims, the
// record page of the shell with the two add-ons (review, rebase) and the gestures. Not a test file (the tests are
// split by area so that Vitest runs them in parallel workers); not part of the story's listed sources either.
// The page is rendered without the list of 200 orders: the add-ons live on the record page only.
import { act } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import { SALES_ORDERS_CRUD, type SalesOrderValues } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';
import { RecordEditor, RecordPage } from '../../../core/src/showcase/RecordPageShell';
import { createSalesOrderStore, type SalesOrderStore, type StoredSalesOrder } from '../../../core/src/showcase/sales-order-store';
import { salesOrderSaveReview } from './sales-order-review';
import { salesOrderRebaseAddons, type SalesOrderRebaseOptions } from './sales-order-rebase';

/** so-1: EUR, invoiced, 3 lines, notes. so-13: USD, invoiced, 4 lines (no notes). */
export const ORDER = 'so-1';
export const LINES_ORDER = 'so-13';

/** Registers the jsdom shims and the per-test cleanup: call it once at the top of each test file. */
export function setupIntegrityTests(): void {
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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
}

export interface PageSetup {
  store: SalesOrderStore;
  onSaved: ReturnType<typeof vi.fn>;
  onBack: ReturnType<typeof vi.fn>;
  options: { current: SalesOrderRebaseOptions };
}

/**
 * The record page of `recordId` with the review (#377 step) and the rebase add-on, as the story plugs them. `rebase:
 * false` leaves the rebase out (the review alone, as the `reviewSave` add-on).
 */
export function renderOrder(
  recordId = ORDER,
  { store = createSalesOrderStore(), rebase = true, ...over }: Partial<SalesOrderRebaseOptions> & { store?: SalesOrderStore; rebase?: boolean } = {},
): PageSetup {
  const options = { current: { serverChange: 'status-and-delivery', serverUpdateDelayMs: 0, simulateServerUpdate: true, ...over } satisfies SalesOrderRebaseOptions };
  const onSaved = vi.fn();
  const onBack = vi.fn();
  render(
    <RecordPage
      module={SALES_ORDERS_CRUD}
      store={store}
      recordId={recordId}
      onBack={onBack}
      onSaved={onSaved}
      reviewSave={salesOrderSaveReview}
      useAddons={rebase ? salesOrderRebaseAddons(options) : undefined}
    />,
  );
  return { store, onSaved, onBack, options };
}

/** The creation page (no record): the add-ons are for an existing order only. */
export function renderCreation(store: SalesOrderStore = createSalesOrderStore()) {
  const options = { current: { serverChange: 'status-and-delivery', serverUpdateDelayMs: 0, simulateServerUpdate: true } satisfies SalesOrderRebaseOptions };
  render(
    <RecordEditor
      module={SALES_ORDERS_CRUD}
      store={store}
      record={null}
      today="2026-11-09"
      onBack={vi.fn()}
      focusTitleOnMount={false}
      reviewSave={salesOrderSaveReview}
      useAddons={salesOrderRebaseAddons(options)}
    />,
  );
  return store;
}

export const opened = (number: RegExp | string = /SO-2026-147000001/) => screen.findByRole('heading', { level: 1, name: number });

// jsdom loads no CSS: a hidden footer is still in the tree, but `inert`.
export const footer = (): HTMLElement | null => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};
export const visibleBar = () =>
  waitFor(() => {
    const el = footer();
    expect(el).not.toBeNull();
    return el!;
  });
export const saveButton = async () => within(await visibleBar()).getByRole('button', { name: 'Save' });
export const notice = () => document.querySelector<HTMLElement>('.rop-pro-rebase-notice');
export const conflictItems = () => within(screen.getByRole('list', { name: 'Conflicts' })).getAllByRole('listitem');
export const reviewDialog = () => screen.findByRole('dialog', { name: 'Review changes' });

/** The text of the items of a list as read by assistive technology (the arrow is `aria-hidden`). */
export const readItems = (list: HTMLElement): string[] =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => {
      const copy = item.cloneNode(true) as Element;
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    });
export const changesIn = (dialog: HTMLElement) => readItems(within(dialog).getByRole('list', { name: 'Changes to save' }));

export const stored = (store: SalesOrderStore, id = ORDER): StoredSalesOrder => store.snapshot().find((o) => o.id === id)!;
export const textbox = (name: string | RegExp) => screen.getByRole('textbox', { name }) as HTMLInputElement;
/** A date Field by the start of its label (a required Field adds its marker to the label). */
export const dateField = (label: string) => screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
export const statusText = () => screen.getByRole('combobox', { name: 'Status' }).textContent ?? '';

export const typeInto = async (el: HTMLElement, text: string) => {
  await userEvent.clear(el);
  await userEvent.type(el, text);
};
export const pick = async (combobox: HTMLElement, name: string) => {
  await userEvent.click(combobox);
  await userEvent.click(await screen.findByRole('option', { name }));
};

/** Another user changes the order on the server, now (the editor gets the announcement). */
export async function serverUpdate(store: SalesOrderStore, change: (o: StoredSalesOrder) => StoredSalesOrder, id = ORDER) {
  await act(async () => {
    await store.updateFromServer(id, change);
  });
}

/** A promise the test resolves itself: holds a save in flight until `release()`. */
export const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

export type { SalesOrderValues };
