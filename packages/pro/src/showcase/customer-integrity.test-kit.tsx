// #524: what the RTL tests of `Pro/Showcase/Record editing integrity` on the customers share: the record page of the
// shell with the two add-ons (review, rebase) and the store of the showcase (the Free one with the archived rule).
// Not a test file (the tests are split by area so that Vitest runs them in parallel workers); not part of the story's
// listed sources either. The page is rendered without the list of 200 customers: the add-ons live on the record page.
// The jsdom shims and the generic gestures are the ones of the Free customer pages (#523).
import { act } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { createCustomerStore, type CustomerStore, type StoredCustomer } from '../../../core/src/showcase/customer-store';
import { footer, visibleBar } from '../../../core/src/showcase/modules/customers/customer-test-kit';
import { RecordPage } from '../../../core/src/showcase/RecordPageShell';
import { customerSaveReview } from './customer-review';
import { CUSTOMERS_WITH_INTEGRITY, customerRebaseAddons, withArchivedGuard, type CustomerRebaseOptions } from './customer-rebase';

export {
  combobox,
  descriptions,
  footer,
  pick,
  retype,
  setupCustomerTests as setupIntegrityTests,
  stored,
  textbox,
  visibleBar,
} from '../../../core/src/showcase/modules/customers/customer-test-kit';

/**
 * cus-4: IT, EUR, active, 2 contacts (Matteo Gatti primary, Giulia Bellini), no line 2. cus-8: SE, EUR, line 2
 * "Gate 2". cus-34: US, USD, 4 contacts. cus-40: JP, JPY, 3 contacts. cus-11: archived.
 */
export const CUSTOMER = 'cus-4';
export const WITH_LINE_2 = 'cus-8';
export const FOUR_CONTACTS = 'cus-34';
export const YEN = 'cus-40';
export const ARCHIVED = 'cus-11';

/** The store of the showcase: the Free one with the archived rule of the integrity showcase. */
export const integrityStore = (config: Parameters<typeof createCustomerStore>[1] = {}): CustomerStore =>
  withArchivedGuard(createCustomerStore(undefined, config));

export interface PageSetup {
  store: CustomerStore;
  onSaved: ReturnType<typeof vi.fn>;
  onBack: ReturnType<typeof vi.fn>;
  options: { current: CustomerRebaseOptions };
}

/**
 * The record page of `recordId` with the review and the rebase add-on, as the story plugs them. `rebase: false`
 * leaves the rebase out (the review alone, as the `reviewSave` add-on).
 */
export function renderCustomer(
  recordId = CUSTOMER,
  { store = integrityStore(), rebase = true, ...over }: Partial<CustomerRebaseOptions> & { store?: CustomerStore; rebase?: boolean } = {},
): PageSetup {
  const options = { current: { serverChange: 'account-manager', serverUpdateDelayMs: 0, simulateServerUpdate: true, ...over } satisfies CustomerRebaseOptions };
  const onSaved = vi.fn();
  const onBack = vi.fn();
  render(
    <RecordPage
      module={CUSTOMERS_WITH_INTEGRITY}
      store={store}
      recordId={recordId}
      onBack={onBack}
      onSaved={onSaved}
      reviewSave={customerSaveReview}
      useAddons={rebase ? customerRebaseAddons(options) : undefined}
    />,
  );
  return { store, onSaved, onBack, options };
}

/** The page once its record is in (the Name field is the first editable one). */
export const opened = () => screen.findByRole('textbox', { name: 'Name' });

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
export const conflictTexts = () => conflictItems().map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim());

/** Another user changes the customer on the server, now (the editor gets the announcement). */
export async function serverUpdate(store: CustomerStore, change: (c: StoredCustomer) => StoredCustomer, id = CUSTOMER) {
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

/** A copy of `value` without its own key `key` (a "missing key", not a key set to `undefined`). */
export function withoutKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

/** The form is clean: no save bar (jsdom: the hidden footer is `inert`). */
export const clean = () => waitFor(() => expect(footer()).toBeNull());
