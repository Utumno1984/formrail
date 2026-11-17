// Story-only (#520, not exported by the package): the Storybook args, controls and helpers of the Sales orders stories
// (`Showcase/Record editing`), in a file of their own so the stories file reads as the stories.
import { fn } from 'storybook/test';
import { SALES_ORDERS } from './modules/sales-orders/sales-orders-module';
import type { RecordCrudProps } from './RecordCrud';
import type { SalesOrderDraft, SalesOrderStore, StoredSalesOrder } from './sales-order-store';
import type { SalesOrderValues } from './modules/sales-orders/sales-orders-module';

export const MODULE = SALES_ORDERS.name;

export type SalesOrderCrudProps = Omit<
  RecordCrudProps<StoredSalesOrder, SalesOrderValues, SalesOrderDraft>,
  'module' | 'onCreated' | 'onDeleted' | 'deleteOutcome' | 'today' | 'addons'
>;

/** The store of the mounted story (`RecordCrud` and the record page story both publish it for the checks). */
export const mountedStore = (win: Window = window): SalesOrderStore | undefined =>
  (win as unknown as { __ropShowcaseStore?: SalesOrderStore }).__ropShowcaseStore;

/**
 * Brings the story iframe back to a clean list of the Sales orders: no record page, no filters, no saved scroll.
 * The module's own list parameters are prefixed with its name (`sales-orders.q`), the route ones are not.
 */
export function resetSalesOrders(win: Window): void {
  for (const key of Object.keys(win.sessionStorage)) {
    if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
  }
  const params = new URLSearchParams(win.location.search);
  for (const key of [...params.keys()]) {
    if (key === 'module' || key === 'record' || key === 'create' || key.startsWith(`${MODULE}.`)) params.delete(key);
  }
  win.history.replaceState(null, '', `${win.location.pathname}?${params.toString()}`);
  win.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

/** The names of the list's own parameters in the URL (the module's, prefixed). */
export const LIST_PARAMS = { filter: `${MODULE}.filter`, search: `${MODULE}.q`, sort: `${MODULE}.sort` } as const;

const DELAY_RANGE = { type: 'range', min: 0, max: 3000, step: 100 } as const;

/** Controls of the stories that open the list first (`RecordCrud` without creation or deletion). */
export const LIST_ARGTYPES = {
  history: {
    control: 'radio',
    options: ['replace', 'push'],
    description: 'How a list gesture (pill, search, sort) writes the URL. Opening an order is always a `push`.',
  },
  listLoadDelayMs: { control: DELAY_RANGE, description: 'How long the list takes to arrive, every time it mounts (also when coming back).' },
  recordLoadDelayMs: { control: DELAY_RANGE, description: 'How long an order takes to arrive.' },
  saveDelayMs: {
    control: DELAY_RANGE,
    description:
      'How long a save takes. Leaving the page while a save is in flight (Back to list, then "Leave anyway") goes at once; the save still completes and the store then holds the saved order.',
  },
  saveOutcome: {
    control: 'radio',
    options: ['success', 'error'],
    description: '`error`: the save fails, the form stays dirty with the message in the footer and the store is unchanged.',
  },
  onNavigate: {
    control: false,
    description: 'Called on the list to order and order to list navigations the user starts (the link, "Back to list"), never on browser Back/Forward.',
  },
  onSaved: { control: false, description: 'Called once per successful save with the order as the server stored it.' },
} as const;

export const LIST_ARGS = {
  history: 'replace',
  listLoadDelayMs: 300,
  recordLoadDelayMs: 300,
  saveDelayMs: 400,
  saveOutcome: 'success',
  onNavigate: fn(),
  onSaved: fn(),
} satisfies Partial<SalesOrderCrudProps>;

/** Deterministic picture of the visual stories: nothing is mid-load when the screenshot is taken. */
export const VISUAL_ARGS = { ...LIST_ARGS, listLoadDelayMs: 0, recordLoadDelayMs: 0, saveDelayMs: 0 } satisfies Partial<SalesOrderCrudProps>;

/* ------------------------------------------------------------------------------------------------------------- */
/* #521: creation and deletion (the `SALES_ORDERS_CRUD` module).                                                    */
/* ------------------------------------------------------------------------------------------------------------- */

/** The props of the stories with creation and deletion: everything the shell takes but the module and the add-ons. */
export type SalesOrderCrudStoryProps = Omit<RecordCrudProps<StoredSalesOrder, SalesOrderValues, SalesOrderDraft>, 'module' | 'addons'>;

export const CRUD_ARGTYPES = {
  ...LIST_ARGTYPES,
  saveDelayMs: {
    control: DELAY_RANGE,
    description:
      'How long a save, a create or a delete takes. Leaving while a Create is in flight ("Leave anyway") goes at once; the order is still created and the list shows it.',
  },
  saveOutcome: {
    control: 'radio',
    options: ['success', 'error'],
    description: '`error`: the create (or the save) fails, the form keeps its values with the message in the footer, nothing is created.',
  },
  today: {
    control: 'text',
    description: 'The default order date of a new order (yyyy-mm-dd; the delivery is requested 14 days later). Empty: the local date.',
  },
  onCreated: {
    control: false,
    description: 'Called once per successful Create with the order as the server stored it, even if the page was left meanwhile.',
  },
  deleteOutcome: {
    control: 'radio',
    options: ['success', 'error'],
    description:
      '`error`: a delete fails after `saveDelayMs`. From the list the row comes back where it was, with an error toast; on the order page the confirmation stays open (Retry by confirming again, or Cancel).',
  },
  onDeleted: {
    control: false,
    description: 'Called once per order the server deleted, from the list, from the order page or in bulk.',
  },
} as const;

export const CRUD_ARGS = {
  ...LIST_ARGS,
  deleteOutcome: 'success',
  onCreated: fn(),
  onDeleted: fn(),
} satisfies Partial<SalesOrderCrudStoryProps>;

/** Deterministic picture of the visual stories of the creation and deletion: no delay, a fixed date for the new order. */
export const CRUD_VISUAL_ARGS = { ...CRUD_ARGS, ...VISUAL_ARGS, today: '2026-11-09' } satisfies Partial<SalesOrderCrudStoryProps>;
