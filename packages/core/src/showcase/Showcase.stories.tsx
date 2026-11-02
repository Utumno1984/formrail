import { useEffect, useLayoutEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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
  // `key`: a different record starts a new page (and a new store), never an in-place rehydration.
  render: (args) => <RecordPageDemo key={args.recordId} {...args} />,
};

export default meta;
type Story = StoryObj<RecordPageArgs>;

const region = (canvas: ReturnType<typeof within>) => canvas.queryByRole('region', { name: 'Save actions' });

/**
 * The whole flow with real input: load (no field until the record arrives), edit the amount (the save
 * bar appears), Discard (original value, bar hidden), edit again, Save (the action is aria-disabled
 * while it runs, then the bar hides and the field shows the amount as the "server" normalized it),
 * and "Back to list" on a clean form leaves at once. Controls: record, delays and save outcome.
 * With `saveOutcome: error` or an unknown `recordId` this play is expected to stop early.
 */
export const RecordPage: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    // The record is in flight: a loading state, no editable control.
    await expect(canvas.getByRole('status')).toHaveTextContent('Loading invoice');
    await expect(canvas.queryByRole('textbox')).toBeNull();
    await expect(canvas.queryByRole('combobox')).toBeNull();

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
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));

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
