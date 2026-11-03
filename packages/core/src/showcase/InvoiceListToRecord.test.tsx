import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceListToRecord } from './InvoiceListToRecord';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/?filter=open');
});
afterEach(cleanup);

describe('InvoiceListToRecord (StrictMode)', () => {
  it('list -> record -> list: one history entry, the list parameters back, the focus on the opened link', async () => {
    const onNavigate = vi.fn();
    const entries = window.history.length;
    render(
      <StrictMode>
        <InvoiceListToRecord history="replace" listLoadDelayMs={0} recordLoadDelayMs={0} onNavigate={onNavigate} />
      </StrictMode>,
    );
    const link = await screen.findByRole('link', { name: 'FT-2026-0012' });
    expect(link.getAttribute('href')).toContain('filter=open');
    expect(link.getAttribute('href')).toContain('record=inv-12');

    await userEvent.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: /FT-2026-0012/ })).toBeTruthy();
    expect(window.location.search).toContain('record=inv-12');
    expect(window.history.length).toBe(entries + 1);
    expect(onNavigate).toHaveBeenCalledTimes(1);

    // A double click on "Back to list" is ONE navigation back.
    await userEvent.dblClick(await screen.findByRole('button', { name: 'Back to list' }));
    await waitFor(() => expect(window.location.search).not.toContain('record='));
    expect(window.location.search).toContain('filter=open');
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate).toHaveBeenLastCalledWith({ to: 'list' });
    await waitFor(() => expect(screen.getByRole('link', { name: 'FT-2026-0012' })).toBe(document.activeElement));
  });

  it('save in flight + Back + Discard changes: leaves at once, the store gets the saved value, no React warning', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSaved = vi.fn();
    render(
      <StrictMode>
        <InvoiceListToRecord
          history="replace"
          listLoadDelayMs={0}
          recordLoadDelayMs={0}
          saveDelayMs={150}
          onNavigate={vi.fn()}
          onSaved={onSaved}
        />
      </StrictMode>,
    );
    await userEvent.click(await screen.findByRole('link', { name: 'FT-2026-0012' }));
    const amount = await screen.findByRole('textbox', { name: /Amount/ });
    await userEvent.clear(amount);
    await userEvent.type(amount, '4242.424');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(window.location.search).not.toContain('record='));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(window.__ropShowcaseStore?.snapshot().find((r) => r.id === 'inv-12')?.amount).toBe(4242.42);
    // The list reloading after the return is async and outside `act`: a harness notice, not a React warning
    // about the save resolving after the page is gone.
    expect(errors.mock.calls.filter(([message]) => !String(message).includes('not wrapped in act'))).toEqual([]);
    errors.mockRestore();
  }, 20_000);
});
