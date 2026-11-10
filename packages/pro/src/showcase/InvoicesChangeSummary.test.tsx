import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceCrud, type InvoiceCrudProps } from '../../../core/src/showcase/InvoiceCrud';
import { invoiceSaveReview } from './invoice-review';

beforeEach(() => {
  // jsdom lacks what Radix Select measures and scrolls with.
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

const base = (over: Partial<InvoiceCrudProps> = {}): InvoiceCrudProps => ({
  history: 'replace',
  listLoadDelayMs: 0,
  recordLoadDelayMs: 0,
  saveDelayMs: 0,
  today: '2026-11-09',
  onNavigate: vi.fn(),
  reviewSave: invoiceSaveReview,
  ...over,
});

// jsdom loads no CSS: a hidden footer is still in the tree, but `inert`.
const footer = () => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};

const store = () => {
  const s = window.__ropShowcaseStore;
  if (!s) throw new Error('no store');
  return s;
};

async function choose(field: RegExp | string, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: field }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

/** Opens FT-2026-0001 from the list; returns its stored record. */
async function openFirst() {
  await userEvent.click(await screen.findByRole('link', { name: 'FT-2026-0001' }));
  await screen.findByRole('heading', { level: 1, name: /FT-2026-0001/ });
  return store().snapshot().find((r) => r.id === 'inv-1')!;
}

const otherSupplier = (current: string) => (current === 'Bianchi Supplies' ? 'Verdi Installations' : 'Bianchi Supplies');
const otherStatus = (current: string) => (current === 'approved' ? 'Rejected' : 'Approved');

describe('Invoices with Change Summary (#377)', () => {
  it('Supplier, Status and Notes changed + Save: "Review changes" with 3 entries, the store NOT called yet', async () => {
    render(
      <StrictMode>
        <InvoiceCrud {...base()} />
      </StrictMode>,
    );
    const record = await openFirst();
    const save = vi.spyOn(store(), 'save');
    await choose(/Supplier/, otherSupplier(record.supplier));
    await choose('Status', otherStatus(record.status));
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' Checked.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('dialog', { name: 'Review changes' });
    expect(dialog).toHaveAccessibleDescription('3 changes will be saved.');
    const items = within(within(dialog).getByRole('list', { name: 'Changes to save' })).getAllByRole('listitem');
    expect(items.map((i) => i.textContent?.split(',')[0])).toEqual(['Supplier', 'Status', 'Notes']);
    expect(items[1]).toHaveTextContent(otherStatus(record.status));
    expect(save).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep editing' })));

    // Confirm: the showcase's own save, once, with the edited values.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toMatchObject({ id: 'inv-1', supplier: otherSupplier(record.supplier) });
    await waitFor(() => expect(footer()).toBeNull());
    // The new baseline is what the store returned.
    expect(store().snapshot().find((r) => r.id === 'inv-1')).toMatchObject({ supplier: otherSupplier(record.supplier) });
  }, 20_000);

  it('one change: "1 change will be saved."', async () => {
    render(<InvoiceCrud {...base()} />);
    await openFirst();
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review changes' });
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
  }, 20_000);

  it('Keep editing: nothing saved, the values stay, the form stays dirty', async () => {
    render(<InvoiceCrud {...base()} />);
    await openFirst();
    const save = vi.spyOn(store(), 'save');
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    await userEvent.type(notes, ' draft');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(save).not.toHaveBeenCalled();
    expect((notes as HTMLInputElement).value).toMatch(/ draft$/);
    expect(footer()).not.toBeNull();
  }, 20_000);

  // The Supplier Select of an existing invoice has no empty option, so the required field emptied here is the amount.
  it('an invalid form (required amount emptied to 0) never opens the review: errors and focus as without it', async () => {
    render(<InvoiceCrud {...base()} />);
    await openFirst();
    const save = vi.spyOn(store(), 'save');
    const amount = screen.getByRole('textbox', { name: /Amount/ });
    await userEvent.clear(amount);
    await userEvent.type(amount, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('1 invalid field')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(amount));
    expect(save).not.toHaveBeenCalled();
  }, 20_000);

  it('a creation saves directly: no review', async () => {
    render(<InvoiceCrud {...base()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'New invoice' }));
    await screen.findByRole('heading', { level: 1, name: 'New invoice' });
    const create = vi.spyOn(store(), 'create');
    await choose(/Supplier/, 'Bianchi Supplies');
    await userEvent.type(screen.getByRole('textbox', { name: /Amount/ }), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Review changes' })).toBeNull();
  }, 20_000);

  it('without reviewSave the Free showcase saves at once (no dialog)', async () => {
    render(<InvoiceCrud {...base({ reviewSave: undefined })} />);
    await openFirst();
    const save = vi.spyOn(store(), 'save');
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 20_000);
});
