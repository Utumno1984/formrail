import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import { SALES_ORDERS_CRUD, type SalesOrderValues } from './sales-orders-module';
import { RecordCrud, type RecordCrudProps } from '../../RecordCrud';
import type { SalesOrderDraft, SalesOrderStore, StoredSalesOrder } from '../../sales-order-store';

// #521: what the three sales order CRUD test files share (creation, deletion, bulk deletion): the jsdom shims, the
// render of the shell on the CRUD module and the gestures. Not a test file: the tests are split in three files so
// that Vitest runs them in parallel workers.
export const EUR_CUSTOMER = 'Hoevenstrand Coatings BV (EUR)';
export const EUR_CUSTOMER_2 = 'Alcorvena Dairy S.A. (EUR)';
export const USD_CUSTOMER = 'Quillenbrook Components Corp. (USD)';

/** Registers the jsdom shims and the per-test setup and cleanup: call it once at the top of each test file. */
export function setupCrudTests(): void {
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
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
}


export type Props = Partial<RecordCrudProps<StoredSalesOrder, SalesOrderValues, SalesOrderDraft>>;
export const renderCrud = (props: Props = {}) =>
  render(
    <StrictMode>
      <RecordCrud
        module={SALES_ORDERS_CRUD}
        history="replace"
        listLoadDelayMs={0}
        recordLoadDelayMs={0}
        saveDelayMs={0}
        today="2026-11-09"
        onNavigate={vi.fn()}
        {...props}
      />
    </StrictMode>,
  );

export const store = (): SalesOrderStore => {
  const s = (window as unknown as { __ropShowcaseStore?: SalesOrderStore }).__ropShowcaseStore;
  if (!s) throw new Error('no store');
  return s;
};
export const shownNumbers = (): string[] =>
  screen.queryAllByRole('button', { name: /^Actions for / }).map((b) => b.getAttribute('aria-label')!.slice('Actions for '.length));
export const listReady = async (): Promise<string[]> => {
  await waitFor(() => expect(shownNumbers().length).toBeGreaterThan(5));
  return shownNumbers();
};
export const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

export async function openCreation(props: Props = {}) {
  renderCrud(props);
  await listReady();
  await userEvent.click(screen.getByRole('button', { name: 'New sales order' }));
  return screen.findByRole('heading', { level: 1, name: 'New sales order' });
}
export const pick = async (combobox: HTMLElement, name: string) => {
  await userEvent.click(combobox);
  await userEvent.click(await screen.findByRole('option', { name }));
};
export const chooseCustomer = (name = EUR_CUSTOMER) => pick(screen.getByRole('combobox', { name: /Customer/ }), name);
export const addLine = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
  await userEvent.click(await screen.findByRole('combobox', { name: /Line 1 product/ }));
  await userEvent.click((await screen.findAllByRole('option'))[0]!);
};
export const typeInto = async (el: HTMLElement, text: string) => {
  await userEvent.clear(el);
  await userEvent.type(el, text);
};
export const createButton = () => screen.getByRole('button', { name: 'Create' });

/** A valid new order: the EUR customer and one line. */
export async function fillValid() {
  await chooseCustomer();
  await addLine();
  await typeInto(screen.getByRole('textbox', { name: /Line 1 quantity/ }), '3');
  await typeInto(screen.getByRole('textbox', { name: /Line 1 unit price/ }), '10.50');
}
