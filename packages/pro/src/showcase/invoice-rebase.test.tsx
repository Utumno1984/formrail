import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceCrud, type InvoiceCrudProps } from '../../../core/src/showcase/InvoiceCrud';
import type { StoredInvoice } from '../../../core/src/showcase/invoice-store';
import { invoiceSaveReview } from './invoice-review';
import {
  CONFLICT_HELP,
  DELETED_TITLE,
  OVERWRITE_TITLE,
  REMOVED_HELP,
  invoiceRebaseAddons,
  serverChangeOf,
  type InvoiceRebaseOptions,
} from './invoice-rebase';

beforeEach(() => {
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

const options: { current: InvoiceRebaseOptions } = {
  current: { serverChange: 'status-and-due-date', serverUpdateDelayMs: 0, simulateServerUpdate: true },
};

const props = (over: Partial<InvoiceCrudProps> = {}): InvoiceCrudProps => ({
  history: 'replace',
  listLoadDelayMs: 0,
  recordLoadDelayMs: 0,
  saveDelayMs: 0,
  today: '2026-11-09',
  onNavigate: vi.fn(),
  reviewSave: invoiceSaveReview,
  useAddons: invoiceRebaseAddons(options),
  ...over,
});

const store = () => window.__ropShowcaseStore!;
const notice = () => document.querySelector<HTMLElement>('.rop-pro-rebase-notice');
const footer = () => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};

async function open(number = 'FT-2026-0001', id = 'inv-1'): Promise<StoredInvoice> {
  await userEvent.click(await screen.findByRole('link', { name: number }));
  await screen.findByRole('heading', { level: 1, name: new RegExp(number) });
  return store().snapshot().find((r) => r.id === id)!;
}

const dueDate = () => screen.getByLabelText('Due date') as HTMLInputElement;

async function serverUpdate(id: string, change: (r: StoredInvoice) => StoredInvoice) {
  await act(async () => {
    await store().updateFromServer(id, change);
  });
}

describe('serverChangeOf', () => {
  const record = { status: 'pending', dueDate: '2026-12-30', lineItems: [{ id: 'a', quantity: 2 }, { id: 'b', quantity: 1 }] } as unknown as StoredInvoice;
  it('status cycles, the due date moves 7 days (across the year), line 1 quantity + 1, line 1 removed', () => {
    expect(serverChangeOf('status')(record).status).toBe('approved');
    expect(serverChangeOf('due-date')(record).dueDate).toBe('2027-01-06');
    expect(serverChangeOf('status-and-due-date')(record)).toMatchObject({ status: 'approved', dueDate: '2027-01-06' });
    expect(serverChangeOf('line-1-quantity')(record).lineItems.map((l) => l.quantity)).toEqual([3, 1]);
    expect(serverChangeOf('remove-line-1')(record).lineItems.map((l) => l.id)).toEqual(['b']);
  });
});

describe('Invoices with Change Summary: server updates (#384)', () => {
  it('clean editor: the fields take the update, the form stays clean, the notice counts the fields', async () => {
    render(<InvoiceCrud {...props()} />);
    const record = await open();
    await serverUpdate('inv-1', serverChangeOf('status-and-due-date'));
    expect(dueDate().value).toBe(serverChangeOf('due-date')(record).dueDate);
    expect(footer()).toBeNull();
    expect(notice()).toHaveTextContent('This invoice was updated while you were editing.2 fields were updated.');
    expect(within(notice()!).queryByRole('list')).toBeNull();
  }, 20_000);

  it('Due date edited, the server changes it too: my value stays, a conflict with both dates (localized), the Field explained via aria-describedby, its name unchanged', async () => {
    render(<InvoiceCrud {...props()} />);
    await open();
    fireEvent.change(dueDate(), { target: { value: '2026-03-05' } });
    await serverUpdate('inv-1', (r) => ({ ...r, dueDate: '2026-03-12' }));
    expect(dueDate().value).toBe('2026-03-05');
    const item = within(screen.getByRole('list', { name: 'Conflicts' })).getByRole('listitem');
    expect(item).toHaveTextContent('Due dateYours: Mar 5, 2026Server: Mar 12, 2026');
    expect(item).not.toHaveTextContent('2026-03');
    const field = dueDate();
    expect(field).toHaveAccessibleDescription(CONFLICT_HELP);
    expect(field).toHaveAccessibleName('Due date');
    // "Use server value": the field takes it, the conflict closes, the explanation goes.
    await userEvent.click(screen.getByRole('button', { name: 'Use server value for Due date' }));
    expect(dueDate().value).toBe('2026-03-12');
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
    expect(dueDate()).not.toHaveAccessibleDescription(CONFLICT_HELP);
    expect(footer()).toBeNull();
  }, 20_000);

  it('a line removed on the server that I edited: a conflict on the row, named with its description, its fields marked', async () => {
    render(<InvoiceCrud {...props()} />);
    await open('FT-2026-0003', 'inv-3');
    const quantity = screen.getByRole('textbox', { name: 'Line 1 quantity' });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '7');
    await serverUpdate('inv-3', serverChangeOf('remove-line-1'));
    const item = within(screen.getByRole('list', { name: 'Conflicts' })).getByRole('listitem');
    expect(item).toHaveTextContent(/^Line items > Item 1 \(Materials\)Yours: Materials, 7 × €42\.90Server: Removed/);
    expect(screen.getByRole('textbox', { name: 'Line 1 quantity' })).toHaveAccessibleDescription(REMOVED_HELP);
  }, 20_000);

  it('Save with an open conflict: the review names the server change it overwrites', async () => {
    render(<InvoiceCrud {...props()} />);
    await open();
    fireEvent.change(dueDate(), { target: { value: '2026-03-05' } });
    await serverUpdate('inv-1', (r) => ({ ...r, dueDate: '2026-03-12' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review changes' });
    expect(within(dialog).getByText(OVERWRITE_TITLE)).toBeTruthy();
    expect(within(within(dialog).getByRole('list', { name: 'Server changes you overwrite' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Due date']);
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
  }, 20_000);

  it('an update landing under the open review: the review follows the new baseline', async () => {
    render(<InvoiceCrud {...props()} />);
    const record = await open();
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review changes' });
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    // The server makes the same edit: nothing of mine is left to save.
    await serverUpdate('inv-1', (r) => ({ ...r, notes: `${record.notes}!` }));
    await waitFor(() => expect(dialog).toHaveAccessibleDescription('Nothing left to save.'));
    expect(within(dialog).queryByRole('list', { name: 'Changes to save' })).toBeNull();
  }, 20_000);

  it('the invoice deleted on the server: an error, no merge', async () => {
    render(<InvoiceCrud {...props()} />);
    await open();
    await act(async () => {
      await store().removeFromServer('inv-1');
    });
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes(DELETED_TITLE))).toBe(true);
    expect(notice()).toBeNull();
  }, 20_000);

  it('the Free showcase (no useAddons) has no "Simulate server update" and ignores server changes', async () => {
    render(<InvoiceCrud {...props({ useAddons: undefined })} />);
    const record = await open();
    expect(screen.queryByRole('button', { name: 'Simulate server update' })).toBeNull();
    await serverUpdate('inv-1', serverChangeOf('due-date'));
    expect(dueDate().value).toBe(record.dueDate);
    expect(notice()).toBeNull();
  }, 20_000);

  it('"Simulate server update" changes the stored invoice and the editor follows', async () => {
    render(<InvoiceCrud {...props()} />);
    const record = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Simulate server update' }));
    await waitFor(() => expect(dueDate().value).toBe(serverChangeOf('due-date')(record).dueDate));
    expect(store().snapshot().find((r) => r.id === 'inv-1')!.status).not.toBe(record.status);
  }, 20_000);
});
