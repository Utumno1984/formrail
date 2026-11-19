import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupCrudTests } from './modules/sales-orders/crud-test-kit';
import { RecordApp, type RecordAppProps } from './RecordApp';
import type { CustomerStore } from './customer-store';
import type { SalesOrderStore } from './sales-order-store';

// #525: the app around the shell: the "Modules" bar, the module that comes from the URL (or from the prop), the stores
// that outlive a module, the order's customer as a link behind the dirty-guard, a customer that is not there, a save
// in flight when the module changes. One 200-row list per render is slow in jsdom: explicit budgets, as in the other
// list tests.
setupCrudTests();

const ORDER = 'so-15'; // confirmed, editable: "Customer reference" is a free text
const BUDGET = 30_000;

const renderApp = (props: Partial<RecordAppProps> = {}) => {
  const onNavigate = vi.fn();
  render(
    <StrictMode>
      <RecordApp
        module="sales-orders"
        history="replace"
        listLoadDelayMs={0}
        recordLoadDelayMs={0}
        saveDelayMs={0}
        saveOutcome="success"
        onNavigate={onNavigate}
        {...props}
      />
    </StrictMode>,
  );
  return { onNavigate };
};

type AppStores = { 'sales-orders': SalesOrderStore; customers: CustomerStore };
const stores = (): AppStores => (window as unknown as { __ropShowcaseAppStores: AppStores }).__ropShowcaseAppStores;
const bar = () => within(screen.getByRole('navigation', { name: 'Modules' }));
const params = () => new URLSearchParams(window.location.search);
const title = () => screen.getByRole('heading', { level: 2 });
const listReady = (module: 'Sales orders' | 'Customers') =>
  waitFor(() => {
    expect(screen.getByRole('heading', { level: 2, name: new RegExp(module) })).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(5);
  });
const openOrder = async () => {
  window.history.replaceState(null, '', `/?module=sales-orders&record=${ORDER}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
const editReference = async (text = 'PO-525-EDIT') => {
  const box = await screen.findByRole('textbox', { name: 'Customer reference' });
  await userEvent.clear(box);
  await userEvent.type(box, text);
  return box as HTMLInputElement;
};
// jsdom loads no CSS: a hidden footer is still in the tree, but `inert`.
const saveBar = () => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};
const customerLink = () => screen.findByRole('link', { name: /^Open customer / });
const dialog = () => screen.findByRole('dialog', { name: 'Unsaved changes' });

describe('the modules bar (#525)', () => {
  it('two links in a nav "Modules", the module shown is aria-current="page", the other is a real link to its list', { timeout: BUDGET }, async () => {
    renderApp();
    await listReady('Sales orders');
    expect(bar().getByRole('link', { name: 'Sales orders' })).toHaveAttribute('aria-current', 'page');
    const customers = bar().getByRole('link', { name: 'Customers' });
    expect(customers).not.toHaveAttribute('aria-current');
    expect(customers.getAttribute('href')).toContain('module=customers');
    expect(bar().getAllByRole('link')).toHaveLength(2);
  });

  it('a click shows the other module, aria-current follows, the report is the app\'s', { timeout: BUDGET }, async () => {
    const { onNavigate } = renderApp();
    await listReady('Sales orders');
    await userEvent.click(bar().getByRole('link', { name: 'Customers' }));
    await listReady('Customers');
    expect(params().get('module')).toBe('customers');
    expect(bar().getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
    expect(bar().getByRole('link', { name: 'Sales orders' })).not.toHaveAttribute('aria-current');
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenLastCalledWith({ to: 'module', module: 'customers' });
  });

  it('the `module` prop is the one shown while the URL names none; a URL that names one wins; a changed prop brings its list', { timeout: BUDGET }, async () => {
    const view = render(
      <RecordApp module="customers" history="replace" listLoadDelayMs={0} recordLoadDelayMs={0} saveDelayMs={0} saveOutcome="success" onNavigate={vi.fn()} />,
    );
    await listReady('Customers');
    expect(bar().getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
    view.rerender(
      <RecordApp module="sales-orders" history="replace" listLoadDelayMs={0} recordLoadDelayMs={0} saveDelayMs={0} saveOutcome="success" onNavigate={vi.fn()} />,
    );
    await listReady('Sales orders');
    expect(params().get('module')).toBe('sales-orders');
    expect(bar().getByRole('link', { name: 'Sales orders' })).toHaveAttribute('aria-current', 'page');
  });

  it('a URL that names a module of the app shows it, whatever the prop says (a deep link to a customer, no list first)', { timeout: BUDGET }, async () => {
    window.history.replaceState(null, '', '/?module=customers&record=cus-4');
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'C-10004' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(bar().getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
  });

  it('each module keeps its pill, its sort and the other\'s while one is shown (the URL carries both)', { timeout: BUDGET }, async () => {
    renderApp();
    await listReady('Sales orders');
    await userEvent.click(screen.getByRole('radio', { name: 'Confirmed' }));
    await userEvent.click(screen.getByRole('button', { name: 'Total' }));
    await userEvent.click(bar().getByRole('link', { name: 'Customers' }));
    await listReady('Customers');
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'On hold' }));
    expect(params().get('sales-orders.filter')).toBe('confirmed');
    expect(params().get('customers.filter')).toBe('on-hold');
    await userEvent.click(bar().getByRole('link', { name: 'Sales orders' }));
    await listReady('Sales orders');
    expect(screen.getByRole('radio', { name: 'Confirmed' })).toBeChecked();
    expect(screen.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(bar().getByRole('link', { name: 'Customers' }));
    await listReady('Customers');
    expect(screen.getByRole('radio', { name: 'On hold' })).toBeChecked();
    expect(title()).toHaveTextContent('Customers');
  });
});

describe('the stores outlive a module (#525)', () => {
  it('a saved order is still saved after Customers and back; a module left is not rebuilt from the seed', { timeout: BUDGET }, async () => {
    await openOrder();
    renderApp();
    await editReference('PO-KEPT-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveBar()).toBeNull());
    await userEvent.click(bar().getByRole('link', { name: 'Customers' }));
    await listReady('Customers');
    await userEvent.click(bar().getByRole('link', { name: 'Sales orders' }));
    await listReady('Sales orders');
    expect(stores()['sales-orders'].snapshot().find((o) => o.id === ORDER)?.customerReference).toBe('PO-KEPT-1');
    window.history.replaceState(null, '', `/?module=sales-orders&record=${ORDER}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByRole('textbox', { name: 'Customer reference' })).toHaveValue('PO-KEPT-1');
  });
});

describe('the order\'s customer, behind the dirty-guard (#525)', () => {
  it('on a clean order the link goes straight to the customer, its href is the customer page', { timeout: BUDGET }, async () => {
    await openOrder();
    const { onNavigate } = renderApp();
    const link = await customerLink();
    const customerId = stores()['sales-orders'].snapshot().find((o) => o.id === ORDER)!.customerId;
    expect(link.getAttribute('href')).toContain(`module=customers`);
    expect(link.getAttribute('href')).toContain(`record=${customerId}`);
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: /^C-\d+$/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onNavigate).toHaveBeenLastCalledWith({ to: 'related', module: 'customers', id: customerId });
    expect(bar().getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
  });

  it('with unsaved changes: the dialog; "Keep editing" keeps the order and the edit, nothing was reported', { timeout: BUDGET }, async () => {
    await openOrder();
    const { onNavigate } = renderApp();
    const box = await editReference();
    await userEvent.click(await customerLink());
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(box).toHaveValue('PO-525-EDIT');
    expect(params().get('module')).toBe('sales-orders');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('"Discard changes" opens the customer; browser Back shows the order as saved, with no edit; the customer\'s Back to list is the Customers list', { timeout: BUDGET }, async () => {
    await openOrder();
    renderApp();
    const saved = ((await screen.findByRole('textbox', { name: 'Customer reference' })) as HTMLInputElement).value;
    await editReference();
    await userEvent.click(await customerLink());
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByRole('heading', { level: 1, name: /^C-\d+$/ })).toBeInTheDocument();
    window.history.back();
    expect(await screen.findByRole('heading', { level: 1, name: /^SO-/ })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Customer reference' })).toHaveValue(saved);
    expect(saveBar()).toBeNull();
    // Forward, then "Back to list" of the customer: its module's list, not the order.
    window.history.forward();
    await screen.findByRole('heading', { level: 1, name: /^C-\d+$/ });
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await listReady('Customers');
    expect(params().get('record')).toBeNull();
    expect(params().get('module')).toBe('customers');
  });

  it('a link of the bar asks the same dialog: "Keep editing" stays, "Discard changes" shows the other module', { timeout: BUDGET }, async () => {
    await openOrder();
    renderApp();
    await editReference();
    await userEvent.click(bar().getByRole('link', { name: 'Customers' }));
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(params().get('module')).toBe('sales-orders');
    expect(screen.getByRole('textbox', { name: 'Customer reference' })).toHaveValue('PO-525-EDIT');
    await userEvent.click(bar().getByRole('link', { name: 'Customers' }));
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Discard changes' }));
    await listReady('Customers');
    expect(params().get('module')).toBe('customers');
  });

  it('a modified click opens the real href (the browser\'s), the app does nothing', { timeout: BUDGET }, async () => {
    await openOrder();
    const { onNavigate } = renderApp();
    const link = await customerLink();
    const user = userEvent.setup(); // one instance: the modifier key stays down for the click
    await user.keyboard('{Control>}');
    await user.click(link);
    await user.keyboard('{/Control}');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(params().get('module')).toBe('sales-orders');
  });
});

describe('a customer that is not there, a save in flight (#525)', () => {
  it('the link of an order whose customer is gone shows "Customer not found"; "Back to list" is the Customers list', { timeout: BUDGET }, async () => {
    await openOrder();
    renderApp();
    const link = await customerLink();
    const customerId = stores()['sales-orders'].snapshot().find((o) => o.id === ORDER)!.customerId;
    await stores().customers.delete(customerId);
    await userEvent.click(link);
    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
    expect(screen.getByText(`There is no customer with id "${customerId}".`)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await listReady('Customers');
    expect(params().get('record')).toBeNull();
    expect(screen.queryByRole('link', { name: customerId })).toBeNull();
  });

  it('a deep link to a customer that does not exist is the same state', { timeout: BUDGET }, async () => {
    window.history.replaceState(null, '', '/?module=customers&record=cus-does-not-exist');
    renderApp();
    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await listReady('Customers');
  });

  it('changing module while a save is in flight asks ("Leave anyway"); the save still lands in the orders\' store', { timeout: BUDGET }, async () => {
    await openOrder();
    renderApp({ saveDelayMs: 2500 });
    await editReference('PO-IN-FLIGHT');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true'));
    expect(stores()['sales-orders'].snapshot().find((o) => o.id === ORDER)?.customerReference).not.toBe('PO-IN-FLIGHT');
    await userEvent.click(bar().getByRole('link', { name: 'Customers' }));
    const ask = await dialog();
    expect(ask).toHaveTextContent('A save is still in progress');
    await userEvent.click(within(ask).getByRole('button', { name: 'Leave anyway' }));
    await listReady('Customers');
    await waitFor(() => expect(stores()['sales-orders'].snapshot().find((o) => o.id === ORDER)?.customerReference).toBe('PO-IN-FLIGHT'), { timeout: 8000 });
    await userEvent.click(bar().getByRole('link', { name: 'Sales orders' }));
    await listReady('Sales orders');
  });
});
