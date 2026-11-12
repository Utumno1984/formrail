import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceEditor, InvoiceRecordPage, type UseInvoiceEditorAddons } from './InvoiceRecordPage';
import { createInvoiceStore, type InvoiceStore } from './invoice-store';

beforeEach(() => {
  // jsdom has no scrollIntoView (a failed Save moves the focus to the first invalid field).
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function setup(config: Parameters<typeof createInvoiceStore>[1] = {}, recordId = 'inv-2') {
  const store = createInvoiceStore(undefined, config);
  const onBack = vi.fn();
  const onSaved = vi.fn();
  const ui = (id: string, s: InvoiceStore = store) => (
    <InvoiceRecordPage store={s} recordId={id} onBack={onBack} onSaved={onSaved} />
  );
  const view = render(ui(recordId));
  return { store, onBack, onSaved, view, ui };
}

// A save held in flight until `release()`: no timer, so CPU contention cannot let it finish early.
function saveGate() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

const amountField = () => screen.findByRole('textbox', { name: /Amount/ });
// jsdom loads no CSS: a hidden footer is still in the tree, but `inert`.
const footer = () => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};

const visibleBar = () =>
  waitFor(() => {
    const el = footer();
    expect(el).not.toBeNull();
    return el!;
  });

describe('InvoiceRecordPage', () => {
  it('mounts no editable field while the record is in flight, then mounts the editor hydrated and clean', async () => {
    const { store } = setup({ loadDelayMs: 50 });
    expect(screen.getByRole('status')).toHaveTextContent('Loading invoice');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    const amount = await amountField();
    const record = await store.get('inv-2');
    expect(amount).toHaveValue(record.amount.toFixed(2));
    expect(footer()).toBeNull();
  });

  it('shows a not-found strip with Back to list and no Retry, no field', async () => {
    const { onBack } = setup({}, 'inv-404');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invoice not found');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a network error offers Retry, which can succeed', async () => {
    setup({ loadOutcome: 'error-once' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the invoice');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await amountField()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('dirty is computed against the baseline: editing shows the footer, restoring the value hides it', async () => {
    setup();
    const amount = await amountField();
    const original = (amount as HTMLInputElement).value;
    await userEvent.type(amount, '9');
    expect(await visibleBar()).toBeInTheDocument();
    await userEvent.type(amount, '{Backspace}');
    expect(amount).toHaveValue(original);
    await waitFor(() => expect(footer()).toBeNull());
  });

  it('the same number written without the trailing zeros is not a change', async () => {
    const { store } = setup({}, 'inv-2');
    const amount = await amountField();
    const baseline = (await store.get('inv-2')).amount.toFixed(2);
    await userEvent.clear(amount);
    await userEvent.type(amount, String(Number(baseline)));
    expect(footer()).toBeNull();
    await userEvent.type(amount, '1');
    await visibleBar();
  });

  it.each(['0x1F', '1e3', '-5', 'abc', '', '0'])('rejects the amount %j', async (typed) => {
    const { onSaved } = setup();
    const amount = await amountField();
    await userEvent.clear(amount);
    if (typed) await userEvent.type(amount, typed);
    await userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Amount must be greater than 0.')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each(['1' + '0'.repeat(21), '9'.repeat(22), '1' + '0'.repeat(21) + '.00'])(
    'rejects the amount %j as too large, not as "not greater than 0" (#418)',
    async (typed) => {
      const { onSaved } = setup();
      const amount = await amountField();
      await userEvent.clear(amount);
      await userEvent.type(amount, typed);
      await userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Amount must be less than 1e21.')).toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();
    },
  );

  it('accepts the largest amount below 1e21 and reloads it as plain digits', async () => {
    const { onSaved, store } = setup();
    const amount = await amountField();
    await userEvent.clear(amount);
    await userEvent.type(amount, '999999999999999868928');
    await userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByText(/Amount must be/)).toBeNull();
    expect((await store.get('inv-2')).amount.toFixed(2)).not.toMatch(/e/i);
  });

  it('announces the loading and the arrival in one live region that is always mounted', async () => {
    setup({ loadDelayMs: 30 });
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Loading invoice');
    await amountField();
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent(/^Invoice FT-2026-\d{4} loaded$/);
  });

  it('after Retry the focus lands on the title, not on the body', async () => {
    setup({ loadOutcome: 'error-once' });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await amountField();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('Discard restores every value to the baseline', async () => {
    setup();
    const amount = await amountField();
    const original = (amount as HTMLInputElement).value;
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    const originalNotes = (notes as HTMLInputElement).value;
    await userEvent.type(amount, '7');
    await userEvent.type(notes, 'x');
    await userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Discard' }));
    expect(amount).toHaveValue(original);
    expect(notes).toHaveValue(originalNotes);
  });

  it('empty notes are not dirty on open (empty string, not missing)', async () => {
    setup({}, 'inv-2');
    await amountField();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('');
    expect(footer()).toBeNull();
  });

  it('an amount of 0 blocks the save, shows the field message and an English summary; the store is untouched', async () => {
    const { store, onSaved } = setup();
    const before = await store.get('inv-2');
    const amount = await amountField();
    await userEvent.clear(amount);
    await userEvent.type(amount, '0');
    const bar = await visibleBar();
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Amount must be greater than 0.')).toBeInTheDocument();
    expect(within(bar).getByRole('status')).toHaveTextContent('Error: 1 invalid field');
    expect(onSaved).not.toHaveBeenCalled();
    expect(await store.get('inv-2')).toEqual(before);
  });

  it('a successful save makes the baseline the server value (normalized) and the form clean', async () => {
    const { store, onSaved } = setup();
    const amount = await amountField();
    await userEvent.clear(amount);
    await userEvent.type(amount, '1234.567');
    await userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(footer()).toBeNull());
    expect(amount).toHaveValue('1234.57');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ amount: 1234.57 }));
    expect((await store.get('inv-2')).amount).toBe(1234.57);
  });

  it('a failed save keeps the form dirty with the typed values, shows the error in the footer, store unchanged', async () => {
    const { store, onSaved } = setup({ saveOutcome: 'error' });
    const before = await store.get('inv-2');
    const amount = await amountField();
    await userEvent.clear(amount);
    await userEvent.type(amount, '55.5');
    const bar = await visibleBar();
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(bar).getByRole('status')).toHaveTextContent('Could not save the invoice'));
    expect(footer()).not.toBeNull();
    expect(amount).toHaveValue('55.5');
    expect(onSaved).not.toHaveBeenCalled();
    expect(await store.get('inv-2')).toEqual(before);
  });

  it('Save is aria-disabled while the save is in flight', async () => {
    const { gate, release } = saveGate();
    setup({ saveDelayMs: gate });
    const amount = await amountField();
    await userEvent.type(amount, '1');
    const save = within(await visibleBar()).getByRole('button', { name: 'Save' });
    await userEvent.click(save);
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));
    // Still held: the attribute does not depend on how quickly the assertion above ran.
    expect(footer()).not.toBeNull();
    release();
    await waitFor(() => expect(footer()).toBeNull());
  });

  it('#166: Back during a save asks with truthful labels, also after a footer Discard made the form clean', async () => {
    const { gate, release } = saveGate();
    const { onBack } = setup({ saveDelayMs: gate });
    const amount = await amountField();
    await userEvent.type(amount, '1');
    const bar = await visibleBar();
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await userEvent.click(within(bar).getByRole('button', { name: 'Discard' }));
    // The form is clean now, the save is still in flight: Back must not skip the confirmation.
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(onBack).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    expect(within(dialog).queryByRole('button', { name: 'Discard changes' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Leave anyway' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    release();
  });

  it('#166: the footer says Discard does not cancel a save in flight; an edit made after Save is called out in the dialog', async () => {
    const { gate, release } = saveGate();
    const { onBack } = setup({ saveDelayMs: gate });
    const amount = await amountField();
    await userEvent.type(amount, '1');
    const bar = await visibleBar();
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(bar).getByRole('status')).toHaveTextContent('the save still completes'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' later');
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    expect(dialog).toHaveTextContent('made after pressing Save');
    expect(within(dialog).queryByRole('button', { name: 'Leave anyway' })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard newer changes' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    release();
  });

  it('Back to list: clean calls onBack at once; dirty asks first (English dialog, X named Close)', async () => {
    const { onBack } = setup();
    const amount = await amountField();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    await userEvent.type(amount, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onBack).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes' }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('a different recordId mounts a fresh editor: no inherited dirty state, no baseline warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { view, ui, store } = setup();
    const amount = await amountField();
    await userEvent.type(amount, '5');
    expect(await visibleBar()).toBeInTheDocument();
    view.rerender(ui('inv-3'));
    // The old editor is gone at once (loading), the new one arrives hydrated and clean.
    expect(screen.queryByRole('textbox', { name: /Amount/ })).toBeNull();
    const next = await amountField();
    expect(next).toHaveValue((await store.get('inv-3')).amount.toFixed(2));
    expect(footer()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it('an in-flight response for a superseded record is dropped', async () => {
    const store = createInvoiceStore(undefined, { loadDelayMs: 100 });
    const onBack = vi.fn();
    const view = render(<InvoiceRecordPage store={store} recordId="inv-1" onBack={onBack} />);
    store.configure({ loadDelayMs: 10 });
    view.rerender(<InvoiceRecordPage store={store} recordId="inv-3" onBack={onBack} />);
    const amount = await amountField();
    expect(amount).toHaveValue((await store.get('inv-3')).amount.toFixed(2));
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.getByRole('textbox', { name: /Amount/ })).toHaveValue((await store.get('inv-3')).amount.toFixed(2));
  });

  it('shows no Italian default of the library in the loading, editor and dialog states', async () => {
    const ITALIAN = ['Sezioni', 'Chiudi', 'Azioni di salvataggio', 'Errore', 'Informazione', 'Operazione riuscita', 'Modifiche non salvate', 'campi non validi', 'Nessuna opzione'];
    setup({ loadDelayMs: 30 });
    const check = () => {
      const text = document.body.innerHTML;
      for (const w of ITALIAN) expect(text).not.toContain(w);
    };
    check();
    const amount = await amountField();
    await userEvent.type(amount, '1');
    await visibleBar();
    check();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await screen.findByRole('dialog');
    check();
  });
});

describe('InvoiceEditor: the story-only useAddons extension point (#384)', () => {
  // An addon with state of its own: swapping it for another hook under a mounted editor would break the order of
  // the hooks (React throws).
  const useCounterAddons: UseInvoiceEditorAddons = () => {
    const [count] = useState(1);
    return { notice: <p>{`addon ${count}`}</p> };
  };

  it('the hook chosen at mount is kept for the life of the editor; a change of the prop warns in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = createInvoiceStore();
    const record = await store.get('inv-2');
    const ui = (useAddons: UseInvoiceEditorAddons | undefined) => (
      <InvoiceEditor store={store} record={record} onBack={vi.fn()} focusTitleOnMount={false} useAddons={useAddons} />
    );
    const view = render(ui(useCounterAddons));
    expect(screen.getByText('addon 1')).toBeTruthy();
    view.rerender(ui(undefined));
    // Still the addon of the mount: no hook-order error, the notice still there.
    expect(screen.getByText('addon 1')).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('useAddons changed'));
    warn.mockRestore();
  });

  it('a creation (no record) never calls the addon hook', () => {
    const addon = vi.fn(() => ({}));
    render(<InvoiceEditor store={createInvoiceStore()} record={null} onBack={vi.fn()} focusTitleOnMount={false} today="2026-11-09" useAddons={addon} />);
    expect(addon).not.toHaveBeenCalled();
  });
});
