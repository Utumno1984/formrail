// Story-only (#523, not exported by the package): the Storybook args, controls and helpers of the Customers stories
// (`Showcase/Record editing`), in a file of their own so the stories file reads as the stories.
import { fn } from 'storybook/test';
import type { CustomerStore, StoredCustomer } from './customer-store';
import { CUSTOMERS, type CustomerValues } from './modules/customers/customers-module';
import type { RecordCrudProps } from './RecordCrud';
import type { LoadOutcome, SaveOutcome } from './record-store';

export const CUSTOMER_MODULE = CUSTOMERS.name;

/** The props of the list stories: the shell without creation nor deletion (the module has neither). */
export type CustomerCrudProps = Omit<
  RecordCrudProps<StoredCustomer, CustomerValues, never>,
  'module' | 'onCreated' | 'onDeleted' | 'deleteOutcome' | 'today' | 'addons'
>;

/** The args of the stories of one customer page (no list). */
export interface CustomerPageArgs {
  recordId: string;
  loadDelayMs: number;
  saveDelayMs: number;
  saveOutcome: SaveOutcome;
  loadOutcome: LoadOutcome;
  onBack: () => void;
  onSaved: (customer: StoredCustomer) => void;
}

/** The store of the mounted story (`RecordCrud` and the customer page story both publish it for the checks). */
export const mountedCustomerStore = (win: Window = window): CustomerStore | undefined =>
  (win as unknown as { __ropShowcaseStore?: CustomerStore }).__ropShowcaseStore;

/**
 * Brings the story iframe back to a clean list of the customers: no record page, no filters, no saved scroll. The
 * module's own list parameters are prefixed with its name (`customers.q`), the route ones are not.
 */
export function resetCustomers(win: Window): void {
  for (const key of Object.keys(win.sessionStorage)) {
    if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
  }
  const params = new URLSearchParams(win.location.search);
  for (const key of [...params.keys()]) {
    if (key === 'module' || key === 'record' || key === 'create' || key.startsWith(`${CUSTOMER_MODULE}.`)) params.delete(key);
  }
  // The customers are not the default module: their list is `?module=customers`.
  params.set('module', CUSTOMER_MODULE);
  win.history.replaceState(null, '', `${win.location.pathname}?${params.toString()}`);
  win.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

/** The names of the list's own parameters in the URL (the module's, prefixed). */
export const CUSTOMER_LIST_PARAMS = {
  filter: `${CUSTOMER_MODULE}.filter`,
  search: `${CUSTOMER_MODULE}.q`,
  sort: `${CUSTOMER_MODULE}.sort`,
} as const;

const DELAY_RANGE = { type: 'range', min: 0, max: 3000, step: 100 } as const;

/** The customers a page story can open, each for a reason given in the control's description. */
export const CUSTOMER_OPTIONS = ['cus-4', 'cus-1', 'cus-6', 'cus-9', 'cus-11', 'cus-17', 'cus-34', 'cus-does-not-exist'];

export const CUSTOMER_PAGE_ARGTYPES = {
  recordId: {
    control: 'select',
    options: CUSTOMER_OPTIONS,
    description:
      'The customer to open: `cus-4` active with two contacts, `cus-1` has a single contact (it cannot be removed), `cus-6` is billed in yen, `cus-9` has an account manager who left the company, `cus-11` is archived (read-only, with Restore), `cus-17` is on hold, `cus-34` has four contacts. `cus-does-not-exist` shows the not-found state. Changing it mounts a fresh editor.',
  },
  loadDelayMs: { control: DELAY_RANGE, description: 'How long the customer takes to arrive. Until then there is a loading state and no field.' },
  saveDelayMs: { control: DELAY_RANGE, description: 'How long a save (or a Restore) takes. While it runs, "Save" (or "Restore") is aria-disabled.' },
  saveOutcome: {
    control: 'radio',
    options: ['success', 'error'],
    description: '`error`: the save fails, the form stays dirty with the typed values; a Restore fails and the customer stays archived.',
  },
  loadOutcome: {
    control: 'radio',
    options: ['success', 'error', 'error-once'],
    description: '`error`: the read fails (network). `error-once`: only the first read fails, so "Retry" succeeds.',
  },
  onBack: { control: false, description: '"Back to list": called at once if clean, after confirmation if dirty.' },
  onSaved: { control: false, description: 'Called once per successful save or Restore with the customer as the server stored it.' },
} as const;

export const CUSTOMER_PAGE_ARGS = {
  recordId: 'cus-4',
  loadDelayMs: 300,
  saveDelayMs: 400,
  saveOutcome: 'success',
  loadOutcome: 'success',
  onBack: fn(),
  onSaved: fn(),
} satisfies CustomerPageArgs;

/** Controls of the stories that open the customer list first. */
export const CUSTOMER_LIST_ARGTYPES = {
  history: {
    control: 'radio',
    options: ['replace', 'push'],
    description: 'How a list gesture (pill, search, sort) writes the URL. Opening a customer is always a `push`.',
  },
  listLoadDelayMs: { control: DELAY_RANGE, description: 'How long the list takes to arrive, every time it mounts (also when coming back).' },
  recordLoadDelayMs: { control: DELAY_RANGE, description: 'How long a customer takes to arrive.' },
  saveDelayMs: {
    control: DELAY_RANGE,
    description: 'How long a save takes. Leaving while it is in flight ("Leave anyway") goes at once; the save still completes.',
  },
  saveOutcome: {
    control: 'radio',
    options: ['success', 'error'],
    description: '`error`: the save fails, the form stays dirty with the message in the footer and the store is unchanged.',
  },
  onNavigate: {
    control: false,
    description: 'Called on the list to customer and customer to list navigations the user starts, never on browser Back/Forward.',
  },
  onSaved: { control: false, description: 'Called once per successful save or Restore with the customer as the server stored it.' },
} as const;

export const CUSTOMER_LIST_ARGS = {
  history: 'replace',
  listLoadDelayMs: 300,
  recordLoadDelayMs: 300,
  saveDelayMs: 400,
  saveOutcome: 'success',
  onNavigate: fn(),
  onSaved: fn(),
} satisfies Partial<CustomerCrudProps>;

/** Deterministic picture of the visual stories: nothing is mid-load when the screenshot is taken. */
export const CUSTOMER_VISUAL_ARGS = {
  ...CUSTOMER_LIST_ARGS,
  listLoadDelayMs: 0,
  recordLoadDelayMs: 0,
  saveDelayMs: 0,
} satisfies Partial<CustomerCrudProps>;
