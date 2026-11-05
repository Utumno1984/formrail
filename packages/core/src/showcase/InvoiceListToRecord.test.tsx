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

// A save held in flight until `release()`: no timer, so CPU contention cannot let it finish early.
function saveGate() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

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
    // Full-page jsdom integration: wall time is dominated by role queries and user-event over the whole
    // showcase and scales with CPU contention. Same budget as the sibling tests below.
  }, 20_000);

  it('save in flight + Back + Leave anyway: leaves at once, the store gets the saved value, no React warning', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSaved = vi.fn();
    const { gate, release } = saveGate();
    render(
      <StrictMode>
        <InvoiceListToRecord
          history="replace"
          listLoadDelayMs={0}
          recordLoadDelayMs={0}
          saveDelayMs={gate}
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
    await userEvent.click(await screen.findByRole('button', { name: 'Leave anyway' }));
    await waitFor(() => expect(window.location.search).not.toContain('record='));
    expect(onSaved).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(window.__ropShowcaseStore?.snapshot().find((r) => r.id === 'inv-12')?.amount).toBe(4242.42);
    // The list reloading after the return is async and outside `act`: a harness notice, not a React warning
    // about the save resolving after the page is gone.
    expect(errors.mock.calls.filter(([message]) => !String(message).includes('not wrapped in act'))).toEqual([]);
    errors.mockRestore();
  }, 20_000);

  it('leaving during a save and re-opening the record: it shows the saved value, a second save keeps it', async () => {
    const { gate, release } = saveGate();
    render(
      <StrictMode>
        <InvoiceListToRecord history="replace" listLoadDelayMs={0} recordLoadDelayMs={0} saveDelayMs={gate} onNavigate={vi.fn()} />
      </StrictMode>,
    );
    await userEvent.click(await screen.findByRole('link', { name: 'FT-2026-0012' }));
    const amount = await screen.findByRole('textbox', { name: /Amount/ });
    await userEvent.clear(amount);
    await userEvent.type(amount, '4242.424');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave anyway' }));
    // The list read waits for the save in flight: it only settles once the save is released.
    release();
    await userEvent.click(await screen.findByRole('link', { name: 'FT-2026-0012' }, { timeout: 5000 }));
    const reopened = await screen.findByRole('textbox', { name: /Amount/ }, { timeout: 5000 });
    expect(reopened).toHaveProperty('value', '4242.42');
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    await userEvent.type(notes, ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const stored = () => window.__ropShowcaseStore?.snapshot().find((r) => r.id === 'inv-12');
    await waitFor(() => expect(stored()?.notes).toContain(' x'), { timeout: 5000 });
    const row = stored();
    expect(row?.amount).toBe(4242.42);
    expect(row?.notes).toContain(' x');
  }, 20_000);
});
