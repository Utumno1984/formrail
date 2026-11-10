// Story-only (not exported by the package): the Storybook args, controls and helpers of the CRUD showcase
// (`Showcase/Invoices` -> `Crud*`), shared with the Pro story of #377 so both offer the SAME controls.
import { fn } from 'storybook/test';
import type { InvoiceCrudProps } from './InvoiceCrud';

/** Brings the story iframe back to a clean list: no record or creation page, no filters, no saved scroll. */
export function resetListToRecord(win: Window): void {
  for (const key of Object.keys(win.sessionStorage)) {
    if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
  }
  const params = new URLSearchParams(win.location.search);
  for (const key of ['filter', 'q', 'sort', 'record', 'create']) params.delete(key);
  win.history.replaceState(null, '', `${win.location.pathname}?${params.toString()}`);
  win.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

export const CRUD_ARGTYPES = {
  history: {
    control: 'radio',
    options: ['replace', 'push'],
    description: 'How a list gesture (pill, search, sort) writes the URL. Opening a page is always a `push`.',
  },
  listLoadDelayMs: {
    control: 'number',
    description: 'How long the list takes to arrive, every time it mounts (also when coming back).',
  },
  recordLoadDelayMs: { control: 'number', description: 'How long an existing record takes to arrive.' },
  saveDelayMs: {
    control: 'number',
    description:
      'How long a save or a create takes (ms). Leaving while a Create is in flight ("Leave anyway") goes at once; the record is still created and the list shows it.',
  },
  saveOutcome: {
    control: 'radio',
    options: ['success', 'error'],
    description: '`error`: the create (or save) fails, the form keeps its values with the message in the footer, nothing is created.',
  },
  today: {
    control: 'text',
    description: 'The default invoice date of a new invoice (yyyy-mm-dd). Empty: the local date.',
  },
  onNavigate: {
    control: false,
    description: 'Called on the navigations the user starts ("New invoice", a link, "Back to list", "Cancel"), never on browser Back/Forward.',
  },
  onSaved: { control: false, description: 'Called once per successful Update.' },
  onCreated: {
    control: false,
    description: 'Called once per successful Create with the record as the server stored it, even if the page was left meanwhile.',
  },
  deleteOutcome: {
    control: 'radio',
    options: ['success', 'error'],
    description:
      '`error`: a delete fails after `saveDelayMs`. From the list the row comes back where it was, with an error toast; on the record page the confirmation stays open (retry or Cancel).',
  },
  onDeleted: {
    control: false,
    description: 'Called once per record the server deleted (`{ id, number }`), from the list or from the record page.',
  },
} as const;

export const CRUD_ARGS = {
  history: 'replace',
  listLoadDelayMs: 300,
  recordLoadDelayMs: 300,
  saveDelayMs: 400,
  saveOutcome: 'success',
  deleteOutcome: 'success',
  onNavigate: fn(),
  onSaved: fn(),
  onCreated: fn(),
  onDeleted: fn(),
} satisfies Partial<InvoiceCrudProps>;
