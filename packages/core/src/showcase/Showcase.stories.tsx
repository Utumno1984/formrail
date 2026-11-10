import { useEffect, useLayoutEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { InvoiceCrud, type InvoiceCrudProps } from './InvoiceCrud';
import { InvoiceListToRecord,type InvoiceListToRecordProps } from './InvoiceListToRecord';
import { InvoiceRecordPage } from './InvoiceRecordPage';
import { createInvoiceStore, type LoadOutcome, type SaveOutcome, type StoredInvoice } from './invoice-store';

/*
 * The first brick of the combined List Report + Object Page showcase: an invoice detail page composed
 * ONLY from the public Object Page pieces (header, Anchor Bar sections, sticky save bar, dirty guard)
 * on top of an in-memory "server". The editor is mounted already hydrated: while the record is in
 * flight there is a loading state and no field at all.
 */

interface RecordPageArgs {
  recordId: string;
  loadDelayMs: number;
  saveDelayMs: number;
  saveOutcome: SaveOutcome;
  /** Not in the ticket's list: drives the "Retry" path (`error-once` fails the first read only). */
  loadOutcome: LoadOutcome;
  onBack: () => void;
  onSaved: (invoice: StoredInvoice) => void;
}

declare global {
  interface Window {
    /** The store of the mounted story, for e2e assertions ("the store did not change"). */
    __ropShowcaseStore?: ReturnType<typeof createInvoiceStore>;
  }
}

function RecordPageDemo({ recordId, loadDelayMs, saveDelayMs, saveOutcome, loadOutcome, onBack, onSaved }: RecordPageArgs) {
  // One store per mount of the story: no module singleton, nothing shared between stories.
  const [store] = useState(() => createInvoiceStore(undefined, { loadDelayMs, saveDelayMs, saveOutcome, loadOutcome }));
  // Layout effect: it runs before the page's passive fetch effect, so a changed control applies to that fetch.
  useLayoutEffect(() => {
    store.configure({ loadDelayMs, saveDelayMs, saveOutcome, loadOutcome });
  }, [store, loadDelayMs, saveDelayMs, saveOutcome, loadOutcome]);
  useEffect(() => {
    window.__ropShowcaseStore = store;
    return () => {
      if (window.__ropShowcaseStore === store) delete window.__ropShowcaseStore;
    };
  }, [store]);
  return <InvoiceRecordPage store={store} recordId={recordId} onBack={onBack} onSaved={onSaved} />;
}

const meta: Meta<RecordPageArgs> = {
  title: 'Showcase/Invoices',
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: "A complete worked example: an invoice record page (Object Page with sections, validation, a sticky save-bar and a dirty-guard) opened from a List Report, built only from the library's components. Use the controls to open another invoice, slow down the load or open one that does not exist; edit a field and try to leave to see the guard." } },
  },
  argTypes: {
    recordId: {
      control: 'select',
      options: ['inv-1', 'inv-2', 'inv-3', 'inv-7', 'inv-does-not-exist'],
      description: 'The invoice to open. `inv-does-not-exist` shows the not-found state. Changing it mounts a fresh editor.',
    },
    loadDelayMs: {
      control: { type: 'range', min: 0, max: 3000, step: 100 },
      description: 'How long the record takes to arrive. Until then there is a loading state and no field.',
    },
    saveDelayMs: {
      control: { type: 'range', min: 0, max: 3000, step: 100 },
      description: 'How long a save takes. While it runs, "Save" is aria-disabled.',
    },
    saveOutcome: {
      control: 'radio',
      options: ['success', 'error'],
      description: '`error`: the save fails, the form stays dirty with the typed values and the store is unchanged.',
    },
    loadOutcome: {
      control: 'radio',
      options: ['success', 'error', 'error-once'],
      description: '`error`: the read fails (network). `error-once`: only the first read fails, so "Retry" succeeds.',
    },
    onBack: { control: false, description: '"Back to list": called at once if clean, after confirmation if dirty.' },
    onSaved: { control: false, description: 'Called once per successful save with the record as the server stored it.' },
  },
  args: {
    recordId: 'inv-2',
    loadDelayMs: 300,
    saveDelayMs: 400,
    saveOutcome: 'success',
    loadOutcome: 'success',
    onBack: fn(),
    onSaved: fn(),
  },
  // No `key` on the demo: the store lives as long as the story mount (a record saved earlier is still
  // saved after switching `recordId` and back); `InvoiceRecordPage` itself mounts a fresh, hydrated
  // editor for the new record.
  render: (args) => <RecordPageDemo {...args} />,
};

export default meta;
type Story = StoryObj<RecordPageArgs>;

const region = (canvas: ReturnType<typeof within>) => canvas.queryByRole('region', { name: 'Save actions' });

/**
 * The whole flow with real input: load (no field until the record arrives), edit the amount (the save
 * bar appears), Discard (original value, bar hidden), edit again, Save (the action is aria-disabled
 * while it runs, then the bar hides and the field shows the amount as the "server" normalized it),
 * and "Back to list" on a clean form leaves at once. Controls: record, delays and save outcome.
 * With `saveOutcome: error`, `loadOutcome: error` or an unknown `recordId` this play is expected to
 * fail (those states are what the Controls are for); a zero delay skips the in-flight assertions.
 */
export const RecordPage: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    // The record is in flight: a loading state, no editable control (only observable with a delay).
    if (args.loadDelayMs > 0) {
      // Two nodes carry the text: the visible one and the hidden live region that announces it.
      await expect(canvas.getByRole('status')).toHaveTextContent('Loading invoice…');
      await expect(canvas.getAllByText('Loading invoice…')).toHaveLength(2);
      await expect(canvas.queryByRole('textbox')).toBeNull();
      await expect(canvas.queryByRole('combobox')).toBeNull();
    }

    // Arrived: the editor is mounted with the record's values and a hidden (clean) footer.
    const amount = await canvas.findByRole('textbox', { name: /Amount/ });
    await expect(region(canvas)).toBeNull();
    const original = (amount as HTMLInputElement).value;
    await expect(original).toMatch(/^\d+\.\d{2}$/);

    // Edit: dirty, the save bar appears.
    await userEvent.clear(amount);
    await userEvent.type(amount, '999.5');
    const bar = await canvas.findByRole('region', { name: 'Save actions' });

    // Discard: every value back to the baseline, the bar hides.
    await userEvent.click(within(bar).getByRole('button', { name: 'Discard' }));
    await expect(amount).toHaveValue(original);
    await waitFor(() => expect(region(canvas)).toBeNull());

    // Edit again with more decimals than the server keeps, then Save.
    await userEvent.clear(amount);
    await userEvent.type(amount, '1234.567');
    const save = within(await canvas.findByRole('region', { name: 'Save actions' })).getByRole('button', { name: 'Save' });
    await userEvent.click(save);
    // The in-flight state is only observable when the save takes a while.
    if (args.saveDelayMs >= 200) await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));

    // Saved: the bar hides, the field shows the server's value (not the typed one), onSaved ran once.
    await waitFor(() => expect(region(canvas)).toBeNull());
    await expect(amount).toHaveValue('1234.57');
    await expect(args.onSaved).toHaveBeenCalledTimes(1);
    await expect(args.onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: args.recordId, amount: 1234.57 }));

    // Clean: "Back to list" leaves at once, with no confirmation dialog.
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    await expect(args.onBack).toHaveBeenCalledTimes(1);
    await expect(body.queryByRole('dialog')).toBeNull();
  },
};

/** `RecordPage` without a `play` function: what `e2e/showcase-record-page.spec.ts` drives with real input. */
export const Manual: Story = {};

/* ------------------------------------------------------------------------------------------ */
/* #150: the list opens the record as a dedicated page and comes back.                          */
/* ------------------------------------------------------------------------------------------ */

type ListToRecordArgs = InvoiceListToRecordProps;

// Controls of `RecordPage` that mean nothing here (the record comes from the clicked row).
const NOT_HERE = { control: false, table: { disable: true } } as const;
const LIST_TO_RECORD_ARGTYPES = {
  recordId: NOT_HERE,
  loadDelayMs: NOT_HERE,
  saveDelayMs: {
    control: { type: 'range', min: 0, max: 3000, step: 100 },
    description:
      'How long a save takes. Leaving the page while a save is in flight (Back to list, then "Leave anyway") goes at once; the save still completes and the store then holds the saved value.',
  },
  saveOutcome: {
    control: 'radio',
    options: ['success', 'error'],
    description: '`error`: the save fails, the form stays dirty with the message in the footer and the store is unchanged.',
  },
  loadOutcome: NOT_HERE,
  onBack: NOT_HERE,
  onSaved: { control: false, description: 'Called once per successful save with the record as the server stored it.' },
  listLoadDelayMs: {
    control: { type: 'range', min: 0, max: 3000, step: 100 },
    description: 'How long the list takes to arrive, every time it mounts (also when coming back).',
  },
  recordLoadDelayMs: {
    control: { type: 'range', min: 0, max: 3000, step: 100 },
    description: 'How long the record takes to arrive.',
  },
  history: {
    control: 'radio',
    options: ['replace', 'push'],
    description: 'How a list gesture (pill, search, sort) writes the URL. Opening a record is always a `push`.',
  },
  onNavigate: {
    control: false,
    description:
      'Called on the list to record and record to list navigations the user starts (the link, "Back to list"), never on browser Back/Forward.',
  },
} as const;
const LIST_TO_RECORD_ARGS = {
  listLoadDelayMs: 300,
  recordLoadDelayMs: 300,
  history: 'replace',
  onNavigate: fn(),
  saveDelayMs: 400,
  saveOutcome: 'success',
  onSaved: fn(),
} satisfies Partial<ListToRecordArgs>;

function resetListToRecord(win: Window): void {
  for (const key of Object.keys(win.sessionStorage)) {
    if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
  }
  const params = new URLSearchParams(win.location.search);
  for (const key of ['filter', 'q', 'sort', 'record', 'create']) params.delete(key);
  win.history.replaceState(null, '', `${win.location.pathname}?${params.toString()}`);
  win.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

/**
 * List Report to Object Page as a dedicated page. The "Number" cell is a real link (`href` = the list's
 * parameters + `record=<id>`); a plain click `pushState`s `record=<id>` and shows the invoice INSTEAD of the
 * list (the list is unmounted). "Back to list" and the browser's Back bring it back with the pill, the search,
 * the sort and the scroll restored, and the focus on the opened row's link (the title if the row is out of
 * view). The play function drives the whole round; Controls: the two load delays and `history`.
 */
export const ListToRecord: StoryObj<ListToRecordArgs> = {
  argTypes: LIST_TO_RECORD_ARGTYPES,
  args: LIST_TO_RECORD_ARGS,
  render: (args) => <InvoiceListToRecord {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('ListToRecord: no window');
    resetListToRecord(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });
    await expect(args.onNavigate).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search' }), 'FT-2026-00{Enter}');
    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    const scrollerOf = () => canvas.getByRole('table').parentElement as HTMLElement;
    scrollerOf().scrollTop = 400;
    await waitFor(() => expect(scrollerOf().scrollTop).toBe(400));
    const before = scrollerOf().scrollTop;
    // A programmatic scroll reports itself with a `scroll` event on the next frame; a person cannot click
    // faster than that, the script can. Give the position time to be seen (and saved) before leaving.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // A link in view, not at the very top.
    const area = scrollerOf().getBoundingClientRect();
    const link = canvas
      .getAllByRole('link')
      .find((l) => l.getBoundingClientRect().top > area.top + 120 && l.getBoundingClientRect().bottom < area.bottom);
    if (!link) throw new Error('ListToRecord: no link in view');
    const number = link.textContent ?? '';
    const id = link.getAttribute('data-record-id');
    await expect(link.getAttribute('href')).toContain(`record=${id}`);
    await expect(link.getAttribute('href')).toContain('filter=open');

    await userEvent.click(link);
    await expect(args.onNavigate).toHaveBeenLastCalledWith({ to: 'record', id });
    await expect(new URLSearchParams(win.location.search).get('record')).toBe(id);
    await expect(await canvas.findByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    await expect(canvas.queryByRole('table')).toBeNull();

    await userEvent.click(await canvas.findByRole('button', { name: 'Back to list' }));
    await expect(args.onNavigate).toHaveBeenLastCalledWith({ to: 'list' });
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });

    const params = new URLSearchParams(win.location.search);
    await expect(params.get('record')).toBeNull();
    await expect(params.get('filter')).toBe('open');
    await expect(params.get('q')).toBe('FT-2026-00');
    await expect(params.get('sort')).toBe('amount.desc');
    await expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked();
    await expect(canvas.getByRole('searchbox', { name: 'Search' })).toHaveValue('FT-2026-00');
    await expect(canvas.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'descending');
    await waitFor(() => expect(Math.abs(scrollerOf().scrollTop - before)).toBeLessThanOrEqual(1));
    await waitFor(() => expect(canvas.getByRole('link', { name: number })).toHaveFocus());
  },
};

/** `ListToRecord` without a `play` function: what `e2e/showcase-list-to-record.spec.ts` drives with real input. */
export const ListToRecordManual: StoryObj<ListToRecordArgs> = {
  argTypes: LIST_TO_RECORD_ARGTYPES,
  args: LIST_TO_RECORD_ARGS,
  render: (args) => <InvoiceListToRecord {...args} />,
};

/* ------------------------------------------------------------------------------------------ */
/* #151: edit -> save / discard -> back to a list that reflects the store, with the dirty guard. */
/* ------------------------------------------------------------------------------------------ */

/** Lets a programmatic scroll report itself (next frame) and be saved before the script leaves the list. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

/**
 * The round a buyer wants to see: filter, sort, scroll, open a record, change the amount, "Back to list" asks
 * for confirmation, "Keep editing" keeps the value and the focus on "Back to list", Save, then "Back to list"
 * leaves with no question and the list shows the amount as the "server" normalized it (the row moved because of
 * the sort), where the list was (pill, search, sort, scroll). Then another record: change, Back, "Discard
 * changes" and the list is unchanged.
 *
 * Declared behaviour: leaving while a save is in flight ("Back to list", then "Leave anyway") is immediate;
 * the save is not cancelled, so once it resolves the store holds the saved value. The demo's reads (the list,
 * a re-opened record) wait for the saves in flight, so they show that value and a later save cannot overwrite
 * it with an older one. The browser's Back/Forward is
 * intercepted by `useDirtyGuard` (#154) with the same dialog; in a browser without the Navigation API this
 * is best effort (see its docs), while closing or reloading the page gets the browser's own prompt. Controls: both load delays, `saveDelayMs`, `saveOutcome` (`error` keeps the form
 * dirty with the message in the footer), `history`.
 */
export const EditFlow: StoryObj<ListToRecordArgs> = {
  argTypes: LIST_TO_RECORD_ARGTYPES,
  args: LIST_TO_RECORD_ARGS,
  render: (args) => <InvoiceListToRecord {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('EditFlow: no window');
    resetListToRecord(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });

    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search' }), 'FT-2026-00{Enter}');
    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    const scrollerOf = () => canvas.getByRole('table').parentElement as HTMLElement;
    scrollerOf().scrollTop = 400;
    await waitFor(() => expect(scrollerOf().scrollTop).toBe(400));
    const before = scrollerOf().scrollTop;
    await settle();

    const pickLink = (skip?: string) => {
      const area = scrollerOf().getBoundingClientRect();
      const found = canvas
        .getAllByRole('link')
        .find(
          (l) =>
            l.textContent !== skip &&
            l.getBoundingClientRect().top > area.top + 120 &&
            l.getBoundingClientRect().bottom < area.bottom,
        );
      if (!found) throw new Error('EditFlow: no link in view');
      return found;
    };
    const rowOf = (number: string) => canvas.getByRole('link', { name: number }).closest('tr') as HTMLElement;
    const amountCell = (number: string) => within(rowOf(number)).getAllByRole('cell')[3] as HTMLElement;
    const back = () => canvas.findByRole('button', { name: 'Back to list' });
    const amountField = () => canvas.findByRole('textbox', { name: /Amount/ });
    const listBack = () => waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });

    // 1. Open a record, change the amount, "Back to list" asks, "Keep editing" keeps everything.
    const link = pickLink();
    const number = link.textContent ?? '';
    const id = link.getAttribute('data-record-id') ?? '';
    await userEvent.click(link);
    const amount = (await amountField()) as HTMLInputElement;
    await userEvent.clear(amount);
    await userEvent.type(amount, '12345.678');
    await userEvent.click(await back());
    const dialog = await body.findByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(amount).toHaveValue('12345.678');
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Back to list' })).toHaveFocus());
    await expect(new URLSearchParams(win.location.search).get('record')).toBe(id);

    // 2. Save, then leave with no question: the row shows the normalized amount, moved by the sort.
    const bar = await canvas.findByRole('region', { name: 'Save actions' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull());
    await expect(amount).toHaveValue('12345.68');
    await expect(args.onSaved).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    await expect(body.queryByRole('dialog')).toBeNull();
    await listBack();
    await expect(amountCell(number)).toHaveTextContent('12.345,68 €');
    await expect(canvas.getAllByRole('row')[1]).toBe(rowOf(number));
    let params = new URLSearchParams(win.location.search);
    await expect(params.get('record')).toBeNull();
    await expect([params.get('filter'), params.get('q'), params.get('sort')]).toEqual(['open', 'FT-2026-00', 'amount.desc']);
    await expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked();
    await waitFor(() => expect(Math.abs(scrollerOf().scrollTop - before)).toBeLessThanOrEqual(1));
    // The saved row moved above the scrolled-to area: the focus goes to the list title.
    await waitFor(() => expect(canvas.getByRole('heading', { level: 2, name: /Invoices/ })).toHaveFocus());

    // 3. Another record: change, Back, "Discard changes": the list and the store are unchanged.
    const other = pickLink(number);
    const otherNumber = other.textContent ?? '';
    const otherAmount = amountCell(otherNumber).textContent ?? '';
    const stored = JSON.stringify(window.__ropShowcaseStore?.snapshot());
    await userEvent.click(other);
    const field = (await amountField()) as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, '777');
    await userEvent.click(await back());
    const confirm = await body.findByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Discard changes' }));
    await listBack();
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(amountCell(otherNumber)).toHaveTextContent(otherAmount);
    await expect(JSON.stringify(window.__ropShowcaseStore?.snapshot())).toBe(stored);
    params = new URLSearchParams(win.location.search);
    await expect(params.get('record')).toBeNull();
  },
};

/** `EditFlow` without a `play` function: what `e2e/showcase-edit-flow.spec.ts` drives with real input. */
export const EditFlowManual: StoryObj<ListToRecordArgs> = {
  argTypes: LIST_TO_RECORD_ARGTYPES,
  args: LIST_TO_RECORD_ARGS,
  render: (args) => <InvoiceListToRecord {...args} />,
};

/* ------------------------------------------------------------------------------------------ */
/* #152: visual-regression states of the combined showcase (3 viewports, via the `visual` tag).   */
/* ------------------------------------------------------------------------------------------ */

// Deterministic picture: no delays (nothing is mid-load when the screenshot is taken) and the same
// first record every time. The `play` brings the story to the state; the visual spec runs it first.
const VISUAL_ARGS = { ...LIST_TO_RECORD_ARGS, listLoadDelayMs: 0, recordLoadDelayMs: 0, saveDelayMs: 0 } satisfies Partial<ListToRecordArgs>;
const VISUAL_NOTE = 'Call the supplier before the due date.';

async function visualStart(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const win = canvasElement.ownerDocument.defaultView;
  if (!win) throw new Error('visual story: no window');
  resetListToRecord(win);
  await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(5), { timeout: 5000 });
  return canvas;
}

async function visualOpenRecord(canvas: ReturnType<typeof within>) {
  await userEvent.click(canvas.getAllByRole('link')[0] as HTMLElement);
  await expect(await canvas.findByRole('heading', { level: 1 })).toBeVisible();
  return (await canvas.findByRole('textbox', { name: 'Notes' })) as HTMLInputElement;
}

async function visualMakeDirty(canvas: ReturnType<typeof within>, notes: HTMLInputElement) {
  await userEvent.clear(notes);
  await userEvent.type(notes, VISUAL_NOTE);
  await expect(await canvas.findByRole('region', { name: 'Save actions' })).toBeVisible();
}

/** A record just opened from the list: header, Anchor Bar, hydrated sections, hidden (clean) save bar. */
export const RecordOpen: StoryObj<ListToRecordArgs> = {
  tags: ['visual'],
  argTypes: LIST_TO_RECORD_ARGTYPES,
  args: VISUAL_ARGS,
  render: (args) => <InvoiceListToRecord {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await visualStart(canvasElement);
    await visualOpenRecord(canvas);
    await expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull();
  },
};

/** The same record after typing in "Notes": the sticky save bar is visible and the space it needs was already reserved. */
export const RecordDirty: StoryObj<ListToRecordArgs> = {
  tags: ['visual'],
  argTypes: LIST_TO_RECORD_ARGTYPES,
  args: VISUAL_ARGS,
  render: (args) => <InvoiceListToRecord {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await visualStart(canvasElement);
    const notes = await visualOpenRecord(canvas);
    await visualMakeDirty(canvas, notes);
    await expect(notes).toHaveValue(VISUAL_NOTE);
  },
};

/** Dirty record, then "Back to list": the confirmation Dialog is open over the page. */
export const LeaveGuardOpen: StoryObj<ListToRecordArgs> = {
  tags: ['visual'],
  argTypes: LIST_TO_RECORD_ARGTYPES,
  args: VISUAL_ARGS,
  render: (args) => <InvoiceListToRecord {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await visualStart(canvasElement);
    const notes = await visualOpenRecord(canvas);
    await visualMakeDirty(canvas, notes);
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    const dialog = await within(document.body).findByRole('dialog', { name: 'Unsaved changes' });
    // The Dialog fades in: "visible" (opacity) is only true once the entry animation has progressed.
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  },
};

/** Edit, Save, "Back to list": the list again, the row link focused, the saved amount in the row. */
export const ListAfterSave: StoryObj<ListToRecordArgs> = {
  tags: ['visual'],
  argTypes: LIST_TO_RECORD_ARGTYPES,
  args: VISUAL_ARGS,
  render: (args) => <InvoiceListToRecord {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = await visualStart(canvasElement);
    const number = canvas.getAllByRole('link')[0]?.textContent ?? '';
    await visualOpenRecord(canvas);
    const amount = (await canvas.findByRole('textbox', { name: /Amount/ })) as HTMLInputElement;
    await userEvent.clear(amount);
    await userEvent.type(amount, '4321.5');
    const bar = await canvas.findByRole('region', { name: 'Save actions' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull());
    await expect(args.onSaved).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(5), { timeout: 5000 });
    const row = canvas.getByRole('link', { name: number }).closest('tr') as HTMLElement;
    await expect(row).toHaveTextContent('4.321,50 €');
    await waitFor(() => expect(canvas.getByRole('link', { name: number })).toHaveFocus());
  },
};

/* ------------------------------------------------------------------------------------------ */
/* #363: CRUD showcase, Create: "New invoice" -> the same editor in creation mode -> back to the list. */
/* ------------------------------------------------------------------------------------------ */

type CrudArgs = InvoiceCrudProps;

const CRUD_ARGTYPES = {
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
const CRUD_ARGS = {
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
} satisfies Partial<CrudArgs>;

/** Picks a supplier in the Select of the editor (its options are in a portal on `document.body`). */
async function chooseSupplierIn(canvas: ReturnType<typeof within>, name: string) {
  await userEvent.click(await canvas.findByRole('combobox', { name: /Supplier/ }));
  await userEvent.click(await within(document.body).findByRole('option', { name }));
}

/**
 * Create, end to end: sort the list by amount, "New invoice" opens the editor in creation mode (focus on the
 * title "New invoice"), pick a supplier, type an amount, "Create": back to the list (same sort, one more row,
 * the count goes from 200 to 201), the new record at the top and focused, and a toast with its number. The
 * form is never reported as "unsaved" after a successful Create. Controls: delays, `saveOutcome` (`error`
 * keeps the form with the message in the footer), `history`, `today`.
 */
export const Crud: StoryObj<CrudArgs> = {
  argTypes: CRUD_ARGTYPES,
  args: CRUD_ARGS,
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('Crud: no window');
    resetListToRecord(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });
    await expect(canvas.getByRole('heading', { level: 2, name: /\(200\)/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));

    await userEvent.click(canvas.getByRole('button', { name: 'New invoice' }));
    await expect(args.onNavigate).toHaveBeenLastCalledWith({ to: 'create' });
    await expect(new URLSearchParams(win.location.search).get('create')).toBe('1');
    const title = await canvas.findByRole('heading', { level: 1, name: 'New invoice' });
    await waitFor(() => expect(title).toHaveFocus());
    await expect(canvas.queryByRole('table')).toBeNull();

    await chooseSupplierIn(canvas, 'Bianchi Supplies');
    await userEvent.type(canvas.getByRole('textbox', { name: /Amount/ }), '999999.5');
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });
    await expect(args.onCreated).toHaveBeenCalledTimes(1);
    await expect(new URLSearchParams(win.location.search).get('create')).toBeNull();
    await expect(new URLSearchParams(win.location.search).get('sort')).toBe('amount.desc');
    await expect(canvas.getByRole('heading', { level: 2, name: /\(201\)/ })).toBeVisible();
    await expect(canvas.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'descending');
    await waitFor(() => expect(canvas.getByRole('link', { name: 'FT-2026-0201' })).toHaveFocus());
    await expect(await within(document.body).findByText('Invoice FT-2026-0201 created')).toBeVisible();
    await expect(within(document.body).queryByRole('dialog')).toBeNull();
  },
};

/**
 * Delete from the list (#365), optimistic: "…" of the second row -> "Delete" -> the confirmation (focus on
 * Cancel) -> "Delete invoice". The row goes AT ONCE, before the server answers (the store still holds it), the
 * count goes from 200 to 199, the focus lands on the "…" of the row that took its place, and once the server
 * answered a toast confirms it. Controls: `saveDelayMs` (how long the server takes), `deleteOutcome` (`error`:
 * the row comes back where it was, with an error toast). On a record page "Delete" waits for the server.
 */
export const CrudDelete: StoryObj<CrudArgs> = {
  argTypes: CRUD_ARGTYPES,
  args: { ...CRUD_ARGS, saveDelayMs: 800 },
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('CrudDelete: no window');
    resetListToRecord(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });
    await expect(canvas.getByRole('heading', { level: 2, name: /\(200\)/ })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Actions for FT-2026-0002' }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await body.findByRole('dialog', { name: 'Delete invoice FT-2026-0002?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete invoice' }));

    // Optimistic: gone from the list while the server still holds it. (`hidden`: until the dialog has finished
    // closing, the page behind it is still `aria-hidden`.)
    await waitFor(() => expect(canvas.queryByRole('link', { name: 'FT-2026-0002', hidden: true })).toBeNull());
    if (args.deleteOutcome !== 'error' && Number(args.saveDelayMs) > 0) {
      await expect(win.__ropShowcaseStore?.snapshot().some((r) => r.number === 'FT-2026-0002')).toBe(true);
    }
    await expect(canvas.getByRole('heading', { level: 2, name: /\(199\)/, hidden: true })).toBeInTheDocument();
    // After the dialog's exit animation.
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Actions for FT-2026-0003' })).toHaveFocus(), { timeout: 3000 });
    await expect(body.queryByRole('dialog')).toBeNull();
    // `waitFor`: a toast enters with an animation (transparent at first).
    if (args.deleteOutcome === 'error') {
      const error = await body.findByText('Could not delete FT-2026-0002', undefined, { timeout: 5000 });
      await waitFor(() => expect(error).toBeVisible());
      await expect(await canvas.findByRole('link', { name: 'FT-2026-0002' })).toBeVisible();
      return;
    }
    const done = await body.findByText('Invoice FT-2026-0002 deleted', undefined, { timeout: 5000 });
    await waitFor(() => expect(done).toBeVisible());
    await expect(win.__ropShowcaseStore?.snapshot().some((r) => r.number === 'FT-2026-0002')).toBe(false);
    await expect(args.onDeleted).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole('button', { name: 'Actions for FT-2026-0003' })).toHaveFocus();
  },
};

/**
 * Bulk delete from the list (#366), optimistic and atomic: tick three rows (the bar says "3 selected"),
 * "Delete selected" -> "Delete 3 invoices?" (focus on Cancel) -> "Delete 3 invoices". The three rows go AT ONCE,
 * before the server answers (the store still holds them), the count goes from 200 to 197, the focus lands on
 * "Select all results", and once the server answered a toast confirms it. Controls: `saveDelayMs`,
 * `deleteOutcome` (`error`: all three rows come back where they were, still selected, with an error toast).
 */
export const CrudBulkDelete: StoryObj<CrudArgs> = {
  argTypes: CRUD_ARGTYPES,
  // 2.5 s: the assertions made "while the server has not answered" (count, focus, store still holding the rows)
  // need a window that a loaded machine does not close under them.
  args: { ...CRUD_ARGS, saveDelayMs: 2500 },
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('CrudBulkDelete: no window');
    resetListToRecord(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });
    await expect(canvas.getByRole('heading', { level: 2, name: /\(200\)/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Delete selected' })).toHaveAttribute('aria-disabled', 'true');

    const numbers = ['FT-2026-0002', 'FT-2026-0004', 'FT-2026-0005'];
    for (const n of numbers) await userEvent.click(canvas.getByRole('checkbox', { name: `Select ${n}` }));
    await expect(canvas.getByText('3 selected')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Delete selected' }));
    const dialog = await body.findByRole('dialog', { name: 'Delete 3 invoices?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 3 invoices' }));

    // Optimistic: gone from the list while the server still holds them.
    for (const n of numbers) await waitFor(() => expect(canvas.queryByRole('link', { name: n, hidden: true })).toBeNull());
    if (args.deleteOutcome !== 'error' && Number(args.saveDelayMs) > 0) {
      await expect(win.__ropShowcaseStore?.snapshot().some((r) => r.number === numbers[0])).toBe(true);
    }
    await expect(canvas.getByRole('heading', { level: 2, name: /\(197\)/, hidden: true })).toBeInTheDocument();
    // After the dialog's exit animation.
    await waitFor(() => expect(canvas.getByRole('checkbox', { name: 'Select all results' })).toHaveFocus(), { timeout: 3000 });
    await expect(body.queryByRole('dialog')).toBeNull();
    if (args.deleteOutcome === 'error') {
      const error = await body.findByText('Could not delete 3 invoices', undefined, { timeout: 5000 });
      await waitFor(() => expect(error).toBeVisible());
      for (const n of numbers) await expect(await canvas.findByRole('link', { name: n })).toBeVisible();
      await expect(canvas.getByText('3 selected')).toBeVisible();
      return;
    }
    const done = await body.findByText('3 invoices deleted', undefined, { timeout: 5000 });
    await waitFor(() => expect(done).toBeVisible());
    await expect(win.__ropShowcaseStore?.snapshot()).toHaveLength(197);
    await expect(args.onDeleted).toHaveBeenCalledTimes(3);
    await expect(canvas.getByText('No items selected')).toBeVisible();
    await expect(canvas.getByRole('checkbox', { name: 'Select all results' })).toHaveFocus();
  },
};

/** `Crud` without a `play` function: what `e2e/showcase-crud-create.spec.ts` drives with real input. */
export const CrudManual: StoryObj<CrudArgs> = {
  argTypes: CRUD_ARGTYPES,
  args: CRUD_ARGS,
  render: (args) => <InvoiceCrud {...args} />,
};

// Visual states of the creation page (3 viewports, via the `visual` tag): `today` is fixed so the dates do not
// change with the calendar, no delays.
const CRUD_VISUAL_ARGS = {
  ...CRUD_ARGS,
  listLoadDelayMs: 0,
  recordLoadDelayMs: 0,
  saveDelayMs: 0,
  today: '2026-11-09',
} satisfies Partial<CrudArgs>;

async function openCreation(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const win = canvasElement.ownerDocument.defaultView;
  if (!win) throw new Error('visual story: no window');
  resetListToRecord(win);
  await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(5), { timeout: 5000 });
  await userEvent.click(canvas.getByRole('button', { name: 'New invoice' }));
  await expect(await canvas.findByRole('heading', { level: 1, name: 'New invoice' })).toBeVisible();
  return canvas;
}

/** A new invoice, untouched: defaults, the locked number, no status badge, the footer already there. */
export const CreateEmpty: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await openCreation(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Save actions' })).toBeVisible();
  },
};

/** "Create" on the empty form: the field errors and the summary in the footer. */
export const CreateInvalid: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await openCreation(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }));
    await expect(await canvas.findByText('2 invalid fields')).toBeVisible();
  },
};

/** A Create in flight (the delay is an hour, the picture is taken before it ends): "Create" disabled, "Saving…". */
export const CreateSaving: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: { ...CRUD_VISUAL_ARGS, saveDelayMs: 3_600_000 },
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await openCreation(canvasElement);
    await chooseSupplierIn(canvas, 'Bianchi Supplies');
    await userEvent.type(canvas.getByRole('textbox', { name: /Amount/ }), '120.5');
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }));
    await expect(await canvas.findByText('Saving…')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** #365: the delete confirmation over the list ("…" of the second row -> "Delete"), not confirmed. */
export const DeleteConfirmList: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('visual story: no window');
    resetListToRecord(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(5), { timeout: 5000 });
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for FT-2026-0002' }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await body.findByRole('dialog', { name: 'Delete invoice FT-2026-0002?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
  },
};

async function openBulkList(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const win = canvasElement.ownerDocument.defaultView;
  if (!win) throw new Error('visual story: no window');
  resetListToRecord(win);
  await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(5), { timeout: 5000 });
  return canvas;
}

/** #366: the selection bar with "Delete selected" disabled (nothing selected). */
export const BulkDeleteIdle: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await openBulkList(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Delete selected' })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** #366: three rows selected, "Delete selected" enabled. */
export const BulkDeleteSelected: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await openBulkList(canvasElement);
    for (const n of ['FT-2026-0002', 'FT-2026-0004', 'FT-2026-0005']) {
      await userEvent.click(canvas.getByRole('checkbox', { name: `Select ${n}` }));
    }
    await expect(canvas.getByText('3 selected')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Delete selected' })).not.toHaveAttribute('aria-disabled');
  },
};

/** #366: the bulk delete confirmation over the list (three rows selected), not confirmed. */
export const BulkDeleteConfirm: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await openBulkList(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    for (const n of ['FT-2026-0002', 'FT-2026-0004', 'FT-2026-0005']) {
      await userEvent.click(canvas.getByRole('checkbox', { name: `Select ${n}` }));
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Delete selected' }));
    const dialog = await body.findByRole('dialog', { name: 'Delete 3 invoices?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
  },
};

/**
 * #365: the delete confirmation over a record page with unsaved changes, CONFIRMED and waiting for the server
 * (the delay is an hour, the picture is taken before it ends): the warning about the unsaved changes, the
 * spinner on "Delete invoice", both buttons `aria-disabled`.
 */
export const DeleteConfirmRecordPending: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: { ...CRUD_VISUAL_ARGS, saveDelayMs: 3_600_000 },
  render: (args) => <InvoiceCrud {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('visual story: no window');
    resetListToRecord(win);
    await userEvent.click(await canvas.findByRole('link', { name: 'FT-2026-0001' }, { timeout: 5000 }));
    await canvas.findByRole('heading', { level: 1, name: /FT-2026-0001/ });
    await userEvent.type(canvas.getByRole('textbox', { name: 'Notes' }), ' (draft)');
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }));
    const dialog = await body.findByRole('dialog', { name: 'Delete invoice FT-2026-0001?' });
    // `waitFor`: the dialog enters with an animation (transparent at first).
    await waitFor(() => expect(within(dialog).getByText(/Unsaved changes will be lost too\./)).toBeVisible());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete invoice' }));
    await expect(within(dialog).getByRole('button', { name: 'Delete invoice' })).toHaveAttribute('aria-disabled', 'true');
  },
};
