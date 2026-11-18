import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import { createCustomerStore, type CustomerStore, type StoredCustomer } from '../../customer-store';
import { RecordPage } from '../../RecordPageShell';
import { CUSTOMERS } from './customers-module';

// #523: what the customer page test files share (jsdom shims, the render of the page, the gestures). Not a test file:
// the tests are split in files so that Vitest runs them in parallel workers. Seed customers (makeShowcaseCustomers):
// cus-4 IT EUR active, 2 contacts; cus-1 one contact; cus-6 JPY; cus-9 account manager who left; cus-11 archived.
export const ACTIVE = 'cus-4';
export const ONE_CONTACT = 'cus-1';
export const YEN = 'cus-6';
export const FORMER_MANAGER = 'cus-9';
export const ARCHIVED = 'cus-11';

/** Registers the jsdom shims and the per-test setup and cleanup: call it once at the top of each test file. */
export function setupCustomerTests(): void {
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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
}

export function setupPage(recordId = ACTIVE, store: CustomerStore = createCustomerStore()) {
  const onBack = vi.fn();
  const onSaved = vi.fn();
  render(<RecordPage module={CUSTOMERS} store={store} recordId={recordId} onBack={onBack} onSaved={onSaved} />);
  return { store, onBack, onSaved };
}

/** The page once its record is in (the Name field is the first editable one). */
export const ready = () => screen.findByRole('textbox', { name: 'Name' });

// jsdom loads no CSS: a hidden footer is still in the tree, but `inert`.
export const footer = () => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};
export const visibleBar = () =>
  waitFor(() => {
    const el = footer();
    expect(el).not.toBeNull();
    return el!;
  });
export const gone = () => waitFor(() => expect(footer()).toBeNull());
export const save = async () => userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));
export const stored = (store: CustomerStore, id: string): StoredCustomer => store.snapshot().find((c) => c.id === id)!;
export const textbox = (name: string | RegExp) => screen.getByRole('textbox', { name }) as HTMLInputElement;
export const combobox = (name: string | RegExp) => screen.getByRole('combobox', { name });
export const pick = async (box: HTMLElement, name: string | RegExp) => {
  await userEvent.click(box);
  await userEvent.click(await screen.findByRole('option', { name }));
};
export const retype = async (el: HTMLElement, text: string) => {
  await userEvent.clear(el);
  if (text !== '') await userEvent.type(el, text);
};
/** The ids of the elements that describe `el`, resolved to their text. */
export const descriptions = (el: HTMLElement): string[] =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? `<missing ${id}>`);
