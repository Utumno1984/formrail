import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { COUNTRY_NAME, formatMoney } from '../internal/demo-data';
import { makeShowcaseCustomers, type CustomerStore } from './customer-store';
import { setupCustomerTests } from './modules/customers/customer-test-kit';
import { CUSTOMERS, accountManagerName } from './modules/customers/customers-module';
import { RecordCrud } from './RecordCrud';

// #523: the Customers module in the shell: the list (columns, pills, the search on code, name and city with the List
// Report's normalization), the link to the page, Save and back to the list.
setupCustomerTests();

const seed = makeShowcaseCustomers();
const renderList = () => {
  window.history.replaceState(null, '', '/');
  const onNavigate = vi.fn();
  const onSaved = vi.fn();
  render(
    <StrictMode>
      <RecordCrud module={CUSTOMERS} history="replace" listLoadDelayMs={0} recordLoadDelayMs={0} saveDelayMs={0} onNavigate={onNavigate} onSaved={onSaved} />
    </StrictMode>,
  );
  return { onNavigate, onSaved };
};
const codes = () => screen.queryAllByRole('link').map((l) => l.textContent ?? '');
const listReady = () => waitFor(() => expect(codes().length).toBeGreaterThan(5));
const heading = () => screen.getByRole('heading', { level: 2 });
const search = async (text: string) => {
  const box = screen.getByRole('searchbox', { name: 'Search' });
  await userEvent.clear(box);
  await userEvent.type(box, `${text}{Enter}`);
};
const store = (): CustomerStore => (window as unknown as { __ropShowcaseStore: CustomerStore }).__ropShowcaseStore;

describe('the customer list (#523)', () => {
  it('200 customers with Code, Name, Country, Account manager, Credit limit (in the customer currency) and Status', async () => {
    renderList();
    await listReady();
    expect(heading()).toHaveTextContent('Customers');
    expect(heading()).toHaveTextContent('(200)');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    for (const name of ['Code', 'Name', 'Country', 'Account manager', 'Credit limit', 'Status']) {
      expect(headers.some((h) => h?.includes(name)), name).toBe(true);
    }
    const first = seed[0]!;
    const row = screen.getByRole('link', { name: first.code }).closest('tr')!;
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual([
      first.code,
      first.name,
      COUNTRY_NAME[first.country],
      accountManagerName(first.accountManagerId),
      formatMoney(first.creditLimitMinor, first.currency),
      'Active',
    ]);
    // A yen customer: whole yen.
    const yen = seed.find((c) => c.id === 'cus-6')!;
    const yenRow = screen.getByRole('link', { name: yen.code }).closest('tr')!;
    expect(within(yenRow).getAllByRole('cell')[4]).toHaveTextContent(/^¥[\d,]+$/);
  });

  it('the pills filter by status', async () => {
    renderList();
    await listReady();
    const count = (status: string) => seed.filter((c) => c.status === status).length;
    await userEvent.click(screen.getByRole('radio', { name: 'On hold' }));
    await waitFor(() => expect(heading()).toHaveTextContent(`(${count('on-hold')} of 200)`));
    expect(codes()).toEqual(seed.filter((c) => c.status === 'on-hold').map((c) => c.code));
    await userEvent.click(screen.getByRole('radio', { name: 'Archived' }));
    await waitFor(() => expect(heading()).toHaveTextContent(`(${count('archived')} of 200)`));
    await userEvent.click(screen.getByRole('radio', { name: 'Active' }));
    await waitFor(() => expect(heading()).toHaveTextContent(`(${count('active')} of 200)`));
  });

  it('the search finds a code, a name and a city, accents and case ignored; not the country nor the account manager', { timeout: 30_000 }, async () => {
    renderList();
    await listReady();
    await search('C-10004');
    await waitFor(() => expect(codes()).toEqual(['C-10004']));
    await search('borgavella tooling');
    await waitFor(() => expect(codes()).toEqual(['C-10004']));
    // A city written without its accents: every customer billed in München, and no other.
    await search('munchen');
    const inMunich = seed.filter((c) => c.billingAddress.city === 'München').map((c) => c.code);
    expect(inMunich.length).toBeGreaterThan(0);
    await waitFor(() => expect(codes()).toEqual(inMunich));
    await search('GÖTEBORG');
    await waitFor(() => expect(codes()).toEqual(seed.filter((c) => c.billingAddress.city === 'Göteborg').map((c) => c.code)));
    // A name with accents, searched without them.
    await search('chatelvorne');
    const chatelvorne = seed.filter((c) => c.name.includes('Châtelvorne')).map((c) => c.code);
    expect(chatelvorne).toContain('C-10020');
    await waitFor(() => expect(codes()).toEqual(chatelvorne));
    // The country and the account manager are columns, not part of the search.
    await search('Italy');
    await waitFor(() => expect(codes()).toEqual([]));
    await search(accountManagerName(seed[0]!.accountManagerId));
    await waitFor(() => expect(codes()).toEqual([]));
  });

  it('the credit limit sorts by the amount (in EUR), descending on the first click', async () => {
    renderList();
    await listReady();
    await userEvent.click(screen.getByRole('button', { name: 'Credit limit' }));
    expect(screen.getByRole('columnheader', { name: /Credit limit/ })).toHaveAttribute('aria-sort', 'descending');
    const top = seed.reduce((a, b) => {
      const eur = (c: typeof a) => c.creditLimitMinor / { EUR: 100, USD: 108, GBP: 85, JPY: 162 }[c.currency];
      return eur(b) > eur(a) ? b : a;
    });
    const firstRow = screen.getAllByRole('row')[1]!;
    expect(within(firstRow).getAllByRole('cell')[4]).toHaveTextContent(formatMoney(top.creditLimitMinor, top.currency));
  });

  it('the code opens the customer page; a name changed and saved is in the list when it comes back', async () => {
    const { onNavigate, onSaved } = renderList();
    await listReady();
    await userEvent.click(screen.getByRole('link', { name: 'C-10004' }));
    expect(onNavigate).toHaveBeenLastCalledWith({ to: 'record', id: 'cus-4' });
    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(screen.queryByRole('table')).toBeNull();
    await userEvent.clear(name);
    await userEvent.type(name, 'Borgavella Tools S.r.l.');
    const bar = await screen.findByRole('region', { name: 'Save actions' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await listReady();
    const row = screen.getByRole('link', { name: 'C-10004' }).closest('tr')!;
    expect(row).toHaveTextContent('Borgavella Tools S.r.l.');
    expect(store().snapshot().find((c) => c.id === 'cus-4')!.name).toBe('Borgavella Tools S.r.l.');
  }, 30_000);
});
