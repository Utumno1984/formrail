import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SALES_ORDERS } from './modules/sales-orders/sales-orders-module';
import { RecordCrud } from './RecordCrud';

// #520: the list of the Sales orders module in the shell: pills by status, search on number and customer, the first
// click on Total descending, the round to an order and back, the new total in the row after a save.
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
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

const renderList = (props: Partial<Parameters<typeof RecordCrud>[0]> = {}) =>
  render(
    <StrictMode>
      <RecordCrud
        module={SALES_ORDERS}
        history="replace"
        listLoadDelayMs={0}
        recordLoadDelayMs={0}
        saveDelayMs={0}
        onNavigate={vi.fn()}
        {...props}
      />
    </StrictMode>,
  );

const dataRows = () => screen.getAllByRole('row').slice(1);
const cell = (row: HTMLElement, n: number) => within(row).getAllByRole('cell')[n]!;

describe('Sales orders list (#520)', () => {
  it('shows the 200 orders, with the six columns and the status as text of a badge', async () => {
    renderList();
    await screen.findAllByRole('link');
    expect(screen.getByRole('heading', { level: 2, name: /Sales orders/ })).toHaveTextContent('200');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual([
      'Number',
      'Customer',
      'Order date',
      'Requested delivery',
      'Total',
      'Status',
    ]);
    expect(cell(dataRows()[0]!, 4)).toHaveTextContent(/^[€$£¥][\d,]+(\.\d{2})?$/);
    expect(cell(dataRows()[0]!, 2)).toHaveTextContent(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
}, 20_000);

  it('a pill keeps the orders of one status; the count says how many', async () => {
    renderList();
    await screen.findAllByRole('link');
    await userEvent.click(screen.getByRole('radio', { name: 'Cancelled' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: /Sales orders/ })).toHaveTextContent('20 of 200'));
    for (const row of dataRows()) expect(cell(row, 5)).toHaveTextContent('Cancelled');
    expect(window.location.search).toContain('sales-orders.filter=cancelled');
}, 20_000);

  it('the search matches a number and a customer, and nothing else (not the dates, not the total)', async () => {
    renderList();
    await screen.findAllByRole('link');
    const search = screen.getByRole('searchbox', { name: 'Search' });
    await userEvent.type(search, 'SO-2026-247000026{Enter}');
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    const customer = cell(dataRows()[0]!, 1).textContent!;
    await userEvent.clear(search);
    await userEvent.type(search, `${customer}{Enter}`);
    await waitFor(() => expect(dataRows().length).toBeGreaterThanOrEqual(1));
    for (const row of dataRows()) expect(cell(row, 1)).toHaveTextContent(customer);
    await userEvent.clear(search);
    await userEvent.type(search, '2026-10-1{Enter}'); // the start of an ISO order date: dates are not searched
    await waitFor(() => expect(screen.getAllByText('No results for the current filters').length).toBeGreaterThan(0));
}, 20_000);

  it('the first click on Total sorts descending, in the amount and not in minor units', async () => {
    renderList();
    await screen.findAllByRole('link');
    await userEvent.click(screen.getByRole('button', { name: 'Total' }));
    expect(screen.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
    const eur = (text: string): number => {
      const n = Number(text.replace(/[^\d.]/g, ''));
      return text.startsWith('¥') ? n / 162 : text.startsWith('$') ? n / 1.08 : text.startsWith('£') ? n / 0.85 : n;
    };
    const totals = dataRows().map((r) => eur(cell(r, 4).textContent!));
    for (let i = 1; i < totals.length; i++) expect(totals[i - 1]!).toBeGreaterThanOrEqual(totals[i]! - 0.01);
}, 20_000);

  it('list -> order -> list: the route has the module, one history entry, the list parameters and the focus come back', async () => {
    const onNavigate = vi.fn();
    const entries = window.history.length;
    renderList({ onNavigate });
    await screen.findAllByRole('link');
    await userEvent.click(screen.getByRole('radio', { name: 'Confirmed' }));
    const link = screen.getAllByRole('link')[0]!;
    const number = link.textContent!;
    expect(link.getAttribute('href')).toContain('module=sales-orders');
    expect(link.getAttribute('href')).toContain('sales-orders.filter=confirmed');
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: number })).toBeInTheDocument();
    expect(window.location.search).toContain('module=sales-orders');
    expect(window.history.length).toBe(entries + 1);

    await userEvent.click(await screen.findByRole('button', { name: 'Back to list' }));
    await waitFor(() => expect(window.location.search).not.toContain('record='));
    expect(window.location.search).toContain('sales-orders.filter=confirmed');
    expect(onNavigate).toHaveBeenLastCalledWith({ to: 'list' });
    await waitFor(() => expect(screen.getByRole('link', { name: number })).toBe(document.activeElement));
    expect(screen.getByRole('radio', { name: 'Confirmed' })).toBeChecked();
  }, 20_000);

  it('a saved quantity changes the total in the row of the list', async () => {
    const onSaved = vi.fn();
    renderList({ onSaved });
    await screen.findAllByRole('link');
    await userEvent.click(screen.getByRole('radio', { name: 'Confirmed' }));
    const link = screen.getAllByRole('link')[0]!;
    const number = link.textContent!;
    const rowOf = () => screen.getByRole('link', { name: number }).closest('tr') as HTMLElement;
    const before = cell(rowOf(), 4).textContent;
    await userEvent.click(link);
    const quantity = await screen.findByRole('textbox', { name: 'Line 1 quantity' });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '88');
    const bar = await screen.findByRole('region', { name: 'Save actions' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const savedTotal = document.querySelector('[data-order-total]')!.textContent;
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await waitFor(() => expect(screen.getByRole('link', { name: number })).toBeInTheDocument());
    expect(cell(rowOf(), 4)).toHaveTextContent(savedTotal!);
    expect(savedTotal).not.toBe(before);
  }, 20_000);
});
