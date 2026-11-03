import { useEffect, useLayoutEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { InvoiceListToRecord, type InvoiceListToRecordProps } from './InvoiceListToRecord';
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
  parameters: { layout: 'fullscreen' },
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
  saveDelayMs: NOT_HERE,
  saveOutcome: NOT_HERE,
  loadOutcome: NOT_HERE,
  onBack: NOT_HERE,
  onSaved: NOT_HERE,
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
} satisfies Partial<ListToRecordArgs>;

function resetListToRecord(win: Window): void {
  for (const key of Object.keys(win.sessionStorage)) {
    if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
  }
  const params = new URLSearchParams(win.location.search);
  for (const key of ['filter', 'q', 'sort', 'record']) params.delete(key);
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
