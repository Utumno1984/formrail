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
