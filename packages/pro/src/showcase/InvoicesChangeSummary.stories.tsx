/// <reference types="vite/client" />
import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
// The Free CRUD showcase itself, from the core sources (one copy, never duplicated in packages/pro): see the
// `no-restricted-imports` rules of eslint.config.js, which allow this import in `src/showcase/` only.
import { CRUD_ARGS, CRUD_ARGTYPES, resetListToRecord } from '../../../core/src/showcase/crud-story-args';
import { InvoiceCrud, type InvoiceCrudProps } from '../../../core/src/showcase/InvoiceCrud';
import { storyControls } from '../../../core/src/internal/story-docs';
import { invoiceSaveReview } from './invoice-review';
import { SERVER_CHANGE_KINDS, invoiceRebaseAddons, type InvoiceRebaseOptions } from './invoice-rebase';
// Story-only helper of the core sources (same exception as the showcase imports above).
import { githubSource, showcaseFiles, showcaseSource } from '../../../core/src/internal/story-example';

const SHOWCASE_FOLDER = 'packages/pro/src/showcase';
// The listed file's text and repository path both derive from its name (see the Free showcase's stories).
const SOURCES = import.meta.glob<string>(['./*.{ts,tsx}', '!./*.{test,stories}.{ts,tsx}'], { query: '?raw', import: 'default', eager: true });
const SOURCE_FILES = showcaseFiles(SHOWCASE_FOLDER, SOURCES, {
  'invoice-review.tsx':
    'The review step plugged into the Free showcase through its `reviewSave` extension point: `ChangeSummary` against the saved record. In your app, import `ChangeSummary`, `computeChangeSummary`, `formatChangeValue` and the `ChangeEntry` type from `@formrail/pro` (this file reaches them through relative imports because it lives inside the Pro package). Not public: the relative imports of the Free showcase (`../../../core/src/showcase/...`: the record page, `number-text` and `showcase-data` fixtures).',
});

/*
 * The Pro Change Summary in a real flow: the SAME CRUD showcase as `Showcase/Invoices` (List Report -> Object
 * Page), with one addition plugged in through its `reviewSave` extension point. Saving an EXISTING invoice
 * first opens "Review changes": what is about to be saved, against the value saved on the server (never the
 * value the invoice had when the page opened). "Save changes" runs the showcase's own save; "Keep editing"
 * goes back to the form with nothing saved. A new invoice ("New invoice" -> "Create") is saved directly.
 */

type Args = Omit<InvoiceCrudProps, 'reviewSave' | 'useAddons'> & InvoiceRebaseOptions;

/** The showcase with the review step (#377) and the server updates merged into the open editor (#384). */
function ProInvoices({ serverChange, serverUpdateDelayMs, simulateServerUpdate, onServerChange, ...crud }: Args) {
  // One hook for the life of the story; it reads the latest args through the ref.
  const options = useRef<InvoiceRebaseOptions>({ serverChange, serverUpdateDelayMs, simulateServerUpdate, onServerChange });
  options.current = { serverChange, serverUpdateDelayMs, simulateServerUpdate, onServerChange };
  const [useAddons] = useState(() => invoiceRebaseAddons(options));
  return <InvoiceCrud {...crud} reviewSave={invoiceSaveReview} useAddons={useAddons} />;
}

const meta: Meta<Args> = {
  title: 'Pro/Showcase/Invoices with Change Summary',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The CRUD showcase of `Showcase/Invoices` with a review step before saving: open an invoice, edit it, press Save and the dialog lists every change (with the field labels and readable values) against the saved record. The line items are reported row by row, matched by `id` (a changed quantity is one entry for that row, a removed row is reported with the values it had); when only their order changed the dialog says so instead of listing nothing. Confirm to save, or keep editing. Controls: `saveDelayMs` (how long the save takes once confirmed), `saveOutcome` (`error`: the save fails, the form stays edited and a new Save reviews the same changes). The source is on [GitHub](' + githubSource('packages/pro/src/showcase') + '), built on the [Free showcase](' + githubSource('packages/core/src/showcase') + '); the review step is at the bottom of this page.',
      },
    },
  },
  // A showcase documents no component: every control is a knob of the demo.
  argTypes: storyControls({
    ...CRUD_ARGTYPES,
    serverChange: {
      control: 'select',
      options: SERVER_CHANGE_KINDS,
      description:
        'What "Simulate server update" changes on the stored invoice, as another user would: the status and the due date, one of them, the quantity of line 1, line 1 removed, or the whole invoice deleted.',
    },
    serverUpdateDelayMs: {
      control: 'number',
      description: 'How long the simulated update takes to reach the server after the click (ms): time to go back to a field and keep typing.',
    },
    simulateServerUpdate: { control: 'boolean', description: 'Shows "Simulate server update" in the header of an existing invoice.' },
    onServerChange: { control: false, description: 'Called with every change of the open invoice the server announces (`{ id, record }`, `record: null` when deleted).' },
  }),
  args: { ...CRUD_ARGS, serverChange: 'status-and-due-date', serverUpdateDelayMs: 1000, simulateServerUpdate: true, onServerChange: fn() },
  render: (args) => <ProInvoices {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

const RECORD = 'FT-2026-0001';

async function chooseOption(canvas: ReturnType<typeof within>, field: RegExp | string, option: string) {
  await userEvent.click(await canvas.findByRole('combobox', { name: field }));
  await userEvent.click(await within(document.body).findByRole('option', { name: option }));
}

/** Opens the record from a clean list; returns the canvas. */
async function openRecord(canvasElement: HTMLElement, record = RECORD) {
  const canvas = within(canvasElement);
  const win = canvasElement.ownerDocument.defaultView;
  if (!win) throw new Error('Invoices with Change Summary: no window');
  resetListToRecord(win);
  await userEvent.click(await canvas.findByRole('link', { name: record }, { timeout: 5000 }));
  await canvas.findByRole('heading', { level: 1, name: new RegExp(record) });
  return canvas;
}

/** The invoice with three line items (Materials, Transport, Installation). */
const RECORD_WITH_LINES = 'FT-2026-0003';

/**
 * Line 3's quantity changed, line 1 removed, a new line added: one entry of each kind. Line 3 is edited BEFORE
 * line 1 goes away, and the review still reports it as the same row (identity by id, never by position).
 */
async function editLines(canvas: ReturnType<typeof within>) {
  await expect(canvas.getByRole('textbox', { name: 'Line 3 quantity' })).toBeVisible();
  const quantity = canvas.getByRole('textbox', { name: 'Line 3 quantity' });
  await userEvent.clear(quantity);
  await userEvent.type(quantity, '9');
  await userEvent.click(canvas.getByRole('button', { name: 'Remove line 1' }));
  await userEvent.click(canvas.getByRole('button', { name: 'Add line' }));
  // The new row is the last one (line 3 now: two rows were left, plus this).
  await userEvent.type(canvas.getByRole('textbox', { name: 'Line 3 description' }), 'Site inspection');
  await userEvent.type(canvas.getByRole('textbox', { name: 'Line 3 quantity' }), '2');
  await userEvent.type(canvas.getByRole('textbox', { name: 'Line 3 unit price' }), '85.5');
}

/** A status other than the record's current one ("Approved" unless it already is). */
const otherStatus = (canvas: ReturnType<typeof within>): string =>
  canvas.getByRole('combobox', { name: 'Status' }).textContent?.includes('Approved') ? 'Rejected' : 'Approved';

/**
 * The whole flow: open an invoice, change its status and its notes, Save -> "Review changes" lists exactly
 * those two changes (the status by its label, not its code) and nothing is saved yet; "Save changes" -> the
 * showcase's own save ("Saving…" in the footer), then "Back to list": the row shows the new status.
 */
export const ReviewChanges: Story = {
  tags: ['showcase-source'],
  parameters: showcaseSource(SHOWCASE_FOLDER, SOURCE_FILES),
  play: async ({ canvasElement, args }) => {
    const canvas = await openRecord(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const win = canvasElement.ownerDocument.defaultView;
    const status = otherStatus(canvas);
    const storedBefore = JSON.stringify(win?.__ropShowcaseStore?.snapshot());

    await chooseOption(canvas, 'Status', status);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Notes' }), ' Checked by finance.');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    // The focus opens on "Keep editing": confirming is a deliberate gesture, never a key still held on Save.
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
    const items = within(within(dialog).getByRole('list', { name: 'Changes to save' })).getAllByRole('listitem');
    await expect(items).toHaveLength(2);
    await expect(items[0]).toHaveTextContent(/^Status.*changed.*/);
    await expect(items[0]).toHaveTextContent(status);
    await expect(items[1]).toHaveTextContent(/Notes.*Checked by finance\./);
    // Reviewing is not saving.
    await expect(JSON.stringify(win?.__ropShowcaseStore?.snapshot())).toBe(storedBefore);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    if (args.saveOutcome === 'error') {
      // The showcase's own failure: the message in the footer, the form still edited.
      await expect(await canvas.findByText('Could not save the invoice: network error', undefined, { timeout: 5000 })).toBeVisible();
      await expect(args.onSaved).not.toHaveBeenCalled();
      return;
    }
    // The footer goes away once the saved record is the new baseline.
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull(), { timeout: 5000 });
    await expect(args.onSaved).toHaveBeenCalledTimes(1);

    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    const link = await canvas.findByRole('link', { name: RECORD }, { timeout: 5000 });
    await expect(link.closest('tr')).toHaveTextContent(status);
  },
};

/** The same story without a `play` function: what `e2e/showcase-pro-change-summary.spec.ts` drives with real input. */
export const Manual: Story = {};

/* ------------------------------------------------------------------------------------------ */
/* Visual regression (3 viewports, via the `visual` tag): the review dialog with three changes.   */
/* ------------------------------------------------------------------------------------------ */

/** About 500 characters: wraps inside the dialog, never scrolls it sideways. */
const LONG_NOTE =
  'Approved after the second check by the finance team. The supplier confirmed by email that the amount ' +
  'includes the transport costs agreed in the framework contract, so no credit note is expected. Payment ' +
  'goes out with the next batch, together with the other invoices of the same supplier, and the reference ' +
  'of the purchase order is written on the transfer. Keep the delivery notes attached to this invoice until ' +
  'the yearly audit: the auditors asked for them last year as well. Questions go to the accounts payable desk.';

/** The dialog over the record page: Supplier, Status and a long Notes changed, Save pressed, not confirmed. */
export const ReviewDialog: Story = {
  tags: ['visual'],
  // Without "Simulate server update" in the header: the subject is the review dialog (baselines of #377/#379).
  args: { ...CRUD_ARGS, listLoadDelayMs: 0, recordLoadDelayMs: 0, saveDelayMs: 0, today: '2026-11-09', simulateServerUpdate: false },
  play: async ({ canvasElement }) => {
    const canvas = await openRecord(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const supplier = canvas.getByRole('combobox', { name: /Supplier/ }).textContent?.includes('Bianchi Supplies')
      ? 'Verdi Installations'
      : 'Bianchi Supplies';
    await chooseOption(canvas, /Supplier/, supplier);
    await chooseOption(canvas, 'Status', otherStatus(canvas));
    const notes = canvas.getByRole('textbox', { name: 'Notes' });
    await userEvent.clear(notes);
    // `paste`, not `type`: 500 keystrokes would take seconds for nothing.
    await userEvent.click(notes);
    await userEvent.paste(LONG_NOTE);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('3 changes will be saved.');
    // `waitFor`: the dialog enters with an animation. The focus opens on "Keep editing" (`initialFocus`).
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
  },
};

/* ------------------------------------------------------------------------------------------ */
/* Line items (#379): the review per row, identified by id.                                       */
/* ------------------------------------------------------------------------------------------ */

/**
 * The line items in the review: an invoice with three lines, line 3's quantity changed, line 1 removed, a new
 * line added. The dialog lists ONE entry per kind, the changed one for the quantity of that row alone (the row
 * is the same one although it moved up when line 1 went away). "Save changes" saves the new rows.
 * A line removed and added back with the same content is a new id: it reads as "removed" + "added".
 */
export const ReviewLineItems: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = await openRecord(canvasElement, RECORD_WITH_LINES);
    const body = within(canvasElement.ownerDocument.body);
    await editLines(canvas);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('3 changes will be saved.');
    const items = within(within(dialog).getByRole('list', { name: 'Changes to save' })).getAllByRole('listitem');
    await expect(items).toHaveLength(3);
    await expect(items[0]).toHaveTextContent(/Line items > Item 2 \(Installation\) > Quantity.*changed.*5.*9/);
    await expect(items[1]).toHaveTextContent(/Line items > Item 3.*added.*Site inspection, 2 × €85\.50/);
    await expect(items[2]).toHaveTextContent(/Line items > Item 1.*removed.*Materials, 3 × €42\.90/);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    if (args.saveOutcome === 'error') return;
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull(), { timeout: 5000 });
    // The saved rows: the baseline is what the server returned, three rows again.
    await expect(canvas.getByRole('textbox', { name: 'Line 2 quantity' })).toHaveValue('9');
    await expect(canvas.getByRole('textbox', { name: 'Line 3 description' })).toHaveValue('Site inspection');
  },
};

/**
 * Only the order changed: the form is dirty but there is no entry to list. Save still opens the review, with
 * its own text instead of an empty list. "Keep editing" goes back to the form (still dirty, nothing saved).
 */
export const ReviewOrderOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openRecord(canvasElement, RECORD_WITH_LINES);
    const body = within(canvasElement.ownerDocument.body);
    const win = canvasElement.ownerDocument.defaultView;
    const storedBefore = JSON.stringify(win?.__ropShowcaseStore?.snapshot());
    await userEvent.click(canvas.getByRole('button', { name: 'Move line 3 up' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('Only the order of the line items changed.');
    await expect(within(dialog).queryByRole('list')).toBeNull();
    await expect(JSON.stringify(win?.__ropShowcaseStore?.snapshot())).toBe(storedBefore);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(canvas.getByRole('region', { name: 'Save actions' })).toBeVisible();
  },
};

/** The dialog over the record page with one entry of each kind (1 added, 1 removed, 1 changed), not confirmed. */
export const ReviewLinesDialog: Story = {
  tags: ['visual'],
  // Without "Simulate server update" in the header: the subject is the review dialog (baselines of #377/#379).
  args: { ...CRUD_ARGS, listLoadDelayMs: 0, recordLoadDelayMs: 0, saveDelayMs: 0, today: '2026-11-09', simulateServerUpdate: false },
  play: async ({ canvasElement }) => {
    const canvas = await openRecord(canvasElement, RECORD_WITH_LINES);
    const body = within(canvasElement.ownerDocument.body);
    await editLines(canvas);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('3 changes will be saved.');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
  },
};

/* ------------------------------------------------------------------------------------------ */
/* Server updates while editing (#384).                                                          */
/* ------------------------------------------------------------------------------------------ */

/**
 * Another user changes the invoice while it is open: edit the Due date and the Notes, then "Simulate server
 * update" (the server changes the Status and the Due date). The Status takes the server value, the Notes stay
 * yours, the Due date is a conflict: "Keep mine for Due date" closes it with your date. Save -> the review lists
 * your two changes -> "Save changes": the notice goes away with the save, the server has your values on top of
 * its Status.
 */
export const ServerUpdate: Story = {
  args: { listLoadDelayMs: 0, recordLoadDelayMs: 0, saveDelayMs: 0, serverUpdateDelayMs: 0, serverChange: 'status-and-due-date' },
  play: async ({ canvasElement, args }) => {
    const canvas = await openRecord(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    const body = within(canvasElement.ownerDocument.body);
    const notice = () => canvasElement.querySelector<HTMLElement>('.rop-pro-rebase-notice');
    const due = canvas.getByLabelText('Due date');
    fireEvent.change(due, { target: { value: '2026-03-05' } });
    await userEvent.type(canvas.getByRole('textbox', { name: 'Notes' }), ' Checked by finance.');
    const status = canvas.getByRole('combobox', { name: 'Status' }).textContent;

    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));
    const conflicts = await canvas.findByRole('list', { name: 'Conflicts' });
    await expect(args.onServerChange).toHaveBeenCalledTimes(1);
    await expect(within(conflicts).getAllByRole('listitem')).toHaveLength(1);
    await expect(within(conflicts).getByRole('listitem')).toHaveTextContent(/^Due date Yours: Mar 5, 2026 Server: /);
    await expect(notice()).toHaveTextContent('This invoice was updated while you were editing.1 field was updated.');
    await expect(canvas.getByRole('combobox', { name: 'Status' }).textContent).not.toBe(status);
    await expect(due).toHaveValue('2026-03-05');
    await expect(due).toHaveAccessibleDescription('Changed on the server too.');
    await expect((canvas.getByRole('textbox', { name: 'Notes' }) as HTMLInputElement).value.endsWith(' Checked by finance.')).toBe(true);

    await userEvent.click(canvas.getByRole('button', { name: 'Keep mine for Due date' }));
    await waitFor(() => expect(canvas.queryByRole('list', { name: 'Conflicts' })).toBeNull());
    await expect(due).toHaveValue('2026-03-05');

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull(), { timeout: 5000 });
    await waitFor(() => expect(notice()).toBeNull());
    const stored = win?.__ropShowcaseStore?.snapshot().find((r) => r.number === RECORD);
    await expect(stored?.dueDate).toBe('2026-03-05');
    await expect(stored?.notes.endsWith(' Checked by finance.')).toBe(true);
  },
};
