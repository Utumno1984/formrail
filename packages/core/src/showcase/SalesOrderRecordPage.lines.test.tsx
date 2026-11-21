import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SALES_ORDERS } from './modules/sales-orders/sales-orders-module';
import { RecordPage } from './RecordPageShell';
import { createSalesOrderStore } from './sales-order-store';

// #527: the cases of the line items of the invoices' page (InvoiceRecordPage.lines.test.tsx, removed with the invoices'
// showcase) that no unit test of the sales orders covered: the focus on a button that became aria-disabled, and the
// errors of the lines after a removal or a reorder. so-15: EUR, confirmed, 2 lines.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

async function setup() {
  render(<RecordPage module={SALES_ORDERS} store={createSalesOrderStore()} recordId="so-15" onBack={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByRole('textbox', { name: 'Line 1 quantity' });
}
const footer = () => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};
const button = (name: string) => screen.getByRole('button', { name });
const field = (name: string) => screen.getByRole('textbox', { name });
const save = async () => userEvent.click(within(await waitFor(() => footer()!)).getByRole('button', { name: 'Save' }));
const noneInvalid = () => {
  for (const el of screen.getAllByRole('textbox')) expect(el).not.toHaveAttribute('aria-invalid', 'true');
};

describe('the lines of an order page (#527)', () => {
  it('moving to the boundary keeps the focus on the (now aria-disabled) button', async () => {
    await setup();
    await userEvent.click(button('Move line 2 up'));
    expect(button('Move line 1 up')).toHaveFocus();
    expect(button('Move line 1 up')).toHaveAttribute('aria-disabled', 'true');
  }, 20_000);

  it('removing a line that has an error leaves no orphan error: the summary is recomputed at the next Save', async () => {
    await setup();
    await userEvent.clear(field('Line 1 quantity'));
    await userEvent.clear(field('Line 2 quantity'));
    await save();
    await waitFor(() => expect(within(footer()!).getByText('2 invalid fields')).toBeInTheDocument());
    await userEvent.click(button('Remove line 1'));
    // The errors of the lines are dropped with the edit of the list, none stays on a line it was not computed for.
    expect(within(footer()!).queryByText(/invalid field/)).toBeNull();
    noneInvalid();
    await userEvent.click(within(footer()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(footer()!).getByText('1 invalid field')).toBeInTheDocument());
    expect(field('Line 1 quantity')).toHaveAttribute('aria-invalid', 'true');
  }, 20_000);

  it('reordering a line that has an error does not leave the error on the wrong line', async () => {
    await setup();
    await userEvent.clear(field('Line 2 quantity'));
    await save();
    await waitFor(() => expect(field('Line 2 quantity')).toHaveAttribute('aria-invalid', 'true'));
    await userEvent.click(button('Move line 2 up'));
    noneInvalid();
    await userEvent.click(within(footer()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(field('Line 1 quantity')).toHaveAttribute('aria-invalid', 'true'));
    expect(field('Line 2 quantity')).not.toHaveAttribute('aria-invalid', 'true');
  }, 20_000);
});
