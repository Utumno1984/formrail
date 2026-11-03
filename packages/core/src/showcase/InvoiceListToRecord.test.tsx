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
});
