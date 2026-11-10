import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceEditor, InvoiceRecordPage, sameValues } from './InvoiceRecordPage';
import { createInvoiceStore } from './invoice-store';

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
});
afterEach(cleanup);

async function setup(recordId = 'inv-3', store = createInvoiceStore()) {
  const onBack = vi.fn();
  const onSaved = vi.fn();
  render(<InvoiceRecordPage store={store} recordId={recordId} onBack={onBack} onSaved={onSaved} />);
  await screen.findByRole('textbox', { name: /Amount/ });
  return { store, onBack, onSaved, user: userEvent.setup() };
}

const footer = () => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};
const button = (name: string) => screen.getByRole('button', { name });
const descriptions = () => screen.getAllByRole('textbox', { name: /^Line \d+ description/ }).map((el) => (el as HTMLInputElement).value);

describe('InvoiceRecordPage: line items', () => {
  it('shows the section with the lines of the record, a read-only total per line, and is clean', async () => {
    const { store } = await setup('inv-3');
    const record = await store.get('inv-3');
    expect(record.lineItems).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Line items' })).toBeInTheDocument();
    expect(descriptions()).toEqual(record.lineItems.map((l) => l.description));
    record.lineItems.forEach((l, i) => {
      expect(screen.getByRole('textbox', { name: `Line ${i + 1} quantity` })).toHaveValue(String(l.quantity));
      expect(screen.getByRole('textbox', { name: `Line ${i + 1} unit price` })).toHaveValue(l.unitPrice.toFixed(2));
      expect(screen.getByText(`Line ${i + 1} total`).nextElementSibling).toHaveTextContent((l.quantity * l.unitPrice).toFixed(2));
    });
    expect(footer()).toBeNull();
  });

  it('gives every repeated button a distinct accessible name', async () => {
    await setup('inv-3');
    for (const n of [1, 2, 3]) {
      expect(button(`Remove line ${n}`)).toBeInTheDocument();
      expect(button(`Move line ${n} up`)).toBeInTheDocument();
      expect(button(`Move line ${n} down`)).toBeInTheDocument();
    }
  });

  it('"Add line" appends an empty line with a new id, focuses its description and makes the form dirty', async () => {
    const { user } = await setup('inv-3');
    await user.click(button('Add line'));
    const added = screen.getByRole('textbox', { name: 'Line 4 description' });
    expect(added).toHaveValue('');
    expect(added).toHaveFocus();
    await waitFor(() => expect(footer()).not.toBeNull());
  });

  it('shows "No line items" for an invoice without lines and keeps "Add line"', async () => {
    const store = createInvoiceStore();
    const record = await store.get('inv-1');
    await store.save({ ...record, lineItems: [] });
    const { user } = await setup('inv-1', store);
    expect(screen.getByText('No line items')).toBeInTheDocument();
    await user.click(button('Add line'));
    expect(screen.queryByText('No line items')).toBeNull();
  });

  it('"Remove line N" removes it and moves the focus to the next line, else the previous one, else "Add line"', async () => {
    const { user } = await setup('inv-3');
    const [first, second, third] = descriptions() as [string, string, string];
    await user.click(button('Remove line 1'));
    expect(descriptions()).toEqual([second, third]);
    expect(button('Remove line 1')).toHaveFocus();
    await user.click(button('Remove line 2'));
    expect(descriptions()).toEqual([second]);
    expect(button('Remove line 1')).toHaveFocus();
    await user.click(button('Remove line 1'));
    expect(screen.getByText('No line items')).toBeInTheDocument();
    expect(button('Add line')).toHaveFocus();
    expect(first).not.toBe('');
    expect(document.body).not.toHaveFocus();
  });

  it('"Move line N up/down" swaps with the neighbour and keeps the focus on the same button of the same line', async () => {
    const { user } = await setup('inv-3');
    const [a, b, c] = descriptions() as [string, string, string];
    await user.click(button('Move line 3 up'));
    expect(descriptions()).toEqual([a, c, b]);
    expect(button('Move line 2 up')).toHaveFocus();
    await user.click(button('Move line 1 down'));
    expect(descriptions()).toEqual([c, a, b]);
    expect(button('Move line 2 down')).toHaveFocus();
  });

  it('the buttons at the boundaries are aria-disabled, do nothing, and the form stays clean', async () => {
    const { user } = await setup('inv-3');
    const before = descriptions();
    expect(button('Move line 1 up')).toHaveAttribute('aria-disabled', 'true');
    expect(button('Move line 3 down')).toHaveAttribute('aria-disabled', 'true');
    expect(button('Move line 2 up')).not.toHaveAttribute('aria-disabled');
    await user.click(button('Move line 1 up'));
    await user.click(button('Move line 3 down'));
    expect(descriptions()).toEqual(before);
    expect(footer()).toBeNull();
  });

  it('moving to the boundary keeps the focus on the (now aria-disabled) button', async () => {
    const { user } = await setup('inv-3');
    await user.click(button('Move line 2 up'));
    expect(button('Move line 1 up')).toHaveFocus();
    expect(button('Move line 1 up')).toHaveAttribute('aria-disabled', 'true');
  });

  it('reordering makes the form dirty and restoring the original order makes it clean again', async () => {
    const { user } = await setup('inv-3');
    await user.click(button('Move line 3 up'));
    await waitFor(() => expect(footer()).not.toBeNull());
    await user.click(button('Move line 2 down'));
    await waitFor(() => expect(footer()).toBeNull());
  });

  it('a unit price retyped with the same number ("150" for "150.00") is not a change', async () => {
    const { user, store } = await setup('inv-3');
    const record = await store.get('inv-3');
    const price = screen.getByRole('textbox', { name: 'Line 1 unit price' });
    await user.clear(price);
    await user.type(price, String(record.lineItems[0]!.unitPrice));
    expect(footer()).toBeNull();
  });

  it('Save with an invalid line shows the errors on the line, the summary, and focuses the first invalid field of the lines', async () => {
    const { user, store, onSaved } = await setup('inv-3');
    const before = JSON.stringify(store.snapshot());
    await user.clear(screen.getByRole('textbox', { name: 'Line 2 description' }));
    const quantity = screen.getByRole('textbox', { name: 'Line 3 quantity' });
    await user.clear(quantity);
    await user.type(quantity, '0');
    await user.click(within(await waitFor(() => footer()!)).getByRole('button', { name: 'Save' }));
    const description = screen.getByRole('textbox', { name: 'Line 2 description' });
    await waitFor(() => expect(description).toHaveFocus());
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox', { name: 'Line 3 quantity' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox', { name: 'Line 1 description' })).not.toHaveAttribute('aria-invalid', 'true');
    expect(within(footer()!).getByText('2 invalid fields')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(JSON.stringify(store.snapshot())).toBe(before);
  });

  it('removing a line that has an error leaves no orphan error: the summary is recomputed at the next Save', async () => {
    const { user } = await setup('inv-3');
    await user.clear(screen.getByRole('textbox', { name: 'Line 1 description' }));
    await user.clear(screen.getByRole('textbox', { name: 'Line 3 quantity' }));
    await user.click(within(await waitFor(() => footer()!)).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(footer()!).getByText('2 invalid fields')).toBeInTheDocument());
    await user.click(button('Remove line 1'));
    // The errors of the lines are dropped with the edit of the list, none stays on a line it was not computed for.
    expect(within(footer()!).queryByText(/invalid field/)).toBeNull();
    for (const el of screen.getAllByRole('textbox')) expect(el).not.toHaveAttribute('aria-invalid', 'true');
    await user.click(within(footer()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(footer()!).getByText('1 invalid field')).toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Line 2 quantity' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('reordering a line that has an error does not leave the error on the wrong line', async () => {
    const { user } = await setup('inv-3');
    await user.clear(screen.getByRole('textbox', { name: 'Line 3 description' }));
    await user.click(within(await waitFor(() => footer()!)).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Line 3 description' })).toHaveAttribute('aria-invalid', 'true'));
    await user.click(button('Move line 3 up'));
    for (const el of screen.getAllByRole('textbox')) expect(el).not.toHaveAttribute('aria-invalid', 'true');
    await user.click(within(footer()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Line 2 description' })).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByRole('textbox', { name: 'Line 3 description' })).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('a valid Save sends the lines in the visible order with numeric quantity and price, and the returned lines are the new baseline', async () => {
    const { user, store, onSaved } = await setup('inv-3');
    const before = await store.get('inv-3');
    await user.click(button('Move line 3 up'));
    await user.click(button('Add line'));
    await user.type(screen.getByRole('textbox', { name: 'Line 4 description' }), 'Consulting');
    await user.type(screen.getByRole('textbox', { name: 'Line 4 quantity' }), '2');
    await user.type(screen.getByRole('textbox', { name: 'Line 4 unit price' }), '150.456');
    expect(screen.getByText('Line 4 total').nextElementSibling).toHaveTextContent('300.91');
    await user.click(within(await waitFor(() => footer()!)).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(footer()).toBeNull());
    const saved = await store.get('inv-3');
    const [l1, l2, l3] = before.lineItems as [(typeof before.lineItems)[number], (typeof before.lineItems)[number], (typeof before.lineItems)[number]];
    expect(saved.lineItems).toEqual([l1, l3, l2, { id: 'new-1', description: 'Consulting', quantity: 2, unitPrice: 150.46 }]);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ lineItems: saved.lineItems }));
    // The baseline is what the store returned (normalized): the price shows 2 decimals and the form is clean.
    expect(screen.getByRole('textbox', { name: 'Line 4 unit price' })).toHaveValue('150.46');
  });

  it('Discard restores the lines, their order and their values', async () => {
    const { user } = await setup('inv-3');
    const before = descriptions();
    await user.click(button('Remove line 1'));
    await user.click(button('Move line 2 up'));
    await user.click(button('Add line'));
    await user.click(within(await waitFor(() => footer()!)).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(footer()).toBeNull());
    expect(descriptions()).toEqual(before);
  });

  it('an id is never reused after add, remove, add', async () => {
    const { user, store } = await setup('inv-1');
    await user.click(button('Add line'));
    await user.click(button('Remove line 2'));
    await user.click(button('Add line'));
    await user.type(screen.getByRole('textbox', { name: 'Line 2 description' }), 'Second');
    await user.type(screen.getByRole('textbox', { name: 'Line 2 quantity' }), '1');
    await user.type(screen.getByRole('textbox', { name: 'Line 2 unit price' }), '5');
    await user.click(within(await waitFor(() => footer()!)).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(footer()).toBeNull());
    expect((await store.get('inv-1')).lineItems.map((l) => l.id)).toEqual(['li-1-1', 'new-2']);
  });

  it('the ids of lines saved earlier are not reused by a new line after reopening the record', async () => {
    const store = createInvoiceStore();
    const record = await store.get('inv-1');
    await store.save({ ...record, lineItems: [...record.lineItems, { id: 'new-1', description: 'Saved', quantity: 1, unitPrice: 1 }] });
    const { user } = await setup('inv-1', store);
    await user.click(button('Add line'));
    await user.type(screen.getByRole('textbox', { name: 'Line 3 description' }), 'x');
    await user.type(screen.getByRole('textbox', { name: 'Line 3 quantity' }), '1');
    await user.type(screen.getByRole('textbox', { name: 'Line 3 unit price' }), '1');
    await user.click(within(await waitFor(() => footer()!)).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(footer()).toBeNull());
    expect((await store.get('inv-1')).lineItems.map((l) => l.id)).toEqual(['li-1-1', 'new-1', 'new-2']);
  });
});

describe('InvoiceEditor: creation with line items', () => {
  it('a new invoice starts without lines and a valid Create works without any', async () => {
    const store = createInvoiceStore();
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<InvoiceEditor store={store} record={null} onBack={vi.fn()} focusTitleOnMount={false} onCreated={onCreated} />);
    expect(screen.getByText('No line items')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: /Supplier/ }));
    await user.click(await screen.findByRole('option', { name: 'Bianchi Supplies' }));
    await user.type(screen.getByRole('textbox', { name: /Amount/ }), '10');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0]![0].lineItems).toEqual([]);
  });
});

describe('sameValues (line items)', () => {
  const base = {
    supplier: 'A',
    status: 'pending' as const,
    amount: '10.00',
    date: '2026-01-01',
    dueDate: '2026-01-31',
    notes: '',
  };
  const l = (id: string, quantity = '2', unitPrice = '150.00') => ({ id, description: id, quantity, unitPrice });

  it('treats 150 and 150.00 as the same, and a reorder as a difference', () => {
    expect(sameValues({ ...base, lineItems: [l('a', '2', '150')] }, { ...base, lineItems: [l('a')] })).toBe(true);
    expect(sameValues({ ...base, lineItems: [l('b'), l('a')] }, { ...base, lineItems: [l('a'), l('b')] })).toBe(false);
    expect(sameValues({ ...base, lineItems: [l('a'), l('b')] }, { ...base, lineItems: [l('a'), l('b')] })).toBe(true);
  });
});
