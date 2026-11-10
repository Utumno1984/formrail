import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
// The Free CRUD showcase itself, from the core sources (one copy, never duplicated in packages/pro): see the
// `no-restricted-imports` rules of eslint.config.js, which allow this import in `src/showcase/` only.
import { CRUD_ARGS, CRUD_ARGTYPES, resetListToRecord } from '../../../core/src/showcase/crud-story-args';
import { InvoiceCrud, type InvoiceCrudProps } from '../../../core/src/showcase/InvoiceCrud';
import { invoiceSaveReview } from './invoice-review';

/*
 * The Pro Change Summary in a real flow: the SAME CRUD showcase as `Showcase/Invoices` (List Report -> Object
 * Page), with one addition plugged in through its `reviewSave` extension point. Saving an EXISTING invoice
 * first opens "Review changes": what is about to be saved, against the value saved on the server (never the
 * value the invoice had when the page opened). "Save changes" runs the showcase's own save; "Keep editing"
 * goes back to the form with nothing saved. A new invoice ("New invoice" -> "Create") is saved directly.
 */

type Args = Omit<InvoiceCrudProps, 'reviewSave'>;

const meta: Meta<Args> = {
  title: 'Pro/Showcase/Invoices with Change Summary',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The CRUD showcase of `Showcase/Invoices` with a review step before saving: open an invoice, edit it, press Save and the dialog lists every change (with the field labels and readable values) against the saved record. Confirm to save, or keep editing. Controls: `saveDelayMs` (how long the save takes once confirmed), `saveOutcome` (`error`: the save fails, the form stays edited and a new Save reviews the same changes).',
      },
    },
  },
  argTypes: CRUD_ARGTYPES,
  args: CRUD_ARGS,
  render: (args) => <InvoiceCrud {...args} reviewSave={invoiceSaveReview} />,
};
export default meta;

type Story = StoryObj<Args>;

const RECORD = 'FT-2026-0001';

async function chooseOption(canvas: ReturnType<typeof within>, field: RegExp | string, option: string) {
  await userEvent.click(await canvas.findByRole('combobox', { name: field }));
  await userEvent.click(await within(document.body).findByRole('option', { name: option }));
}

/** Opens the record from a clean list; returns the canvas. */
async function openRecord(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const win = canvasElement.ownerDocument.defaultView;
  if (!win) throw new Error('Invoices with Change Summary: no window');
  resetListToRecord(win);
  await userEvent.click(await canvas.findByRole('link', { name: RECORD }, { timeout: 5000 }));
  await canvas.findByRole('heading', { level: 1, name: new RegExp(RECORD) });
  return canvas;
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
  args: { ...CRUD_ARGS, listLoadDelayMs: 0, recordLoadDelayMs: 0, saveDelayMs: 0, today: '2026-11-09' },
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
    // `waitFor`: the dialog enters with an animation.
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save changes' })).toHaveFocus());
  },
};
