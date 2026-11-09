import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceCrud, type InvoiceCrudProps } from './InvoiceCrud';

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
  window.history.replaceState(null, '', '/?filter=open');
});
afterEach(cleanup);

const base = (over: Partial<InvoiceCrudProps> = {}): InvoiceCrudProps => ({
  history: 'replace',
  listLoadDelayMs: 0,
  recordLoadDelayMs: 0,
  saveDelayMs: 0,
  today: '2026-11-09',
  onNavigate: vi.fn(),
  ...over,
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function chooseSupplier(name: string) {
  await userEvent.click(screen.getByRole('combobox', { name: /Supplier/ }));
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('InvoiceCrud: Create', () => {
  it('opens the creation page clean: defaults, locked number, no status badge, footer visible, no dialog on Cancel', async () => {
    const onNavigate = vi.fn();
    const entries = window.history.length;
    render(
      <StrictMode>
        <InvoiceCrud {...base({ onNavigate })} />
      </StrictMode>,
    );
    await userEvent.dblClick(await screen.findByRole('button', { name: 'New invoice' }));
    const title = await screen.findByRole('heading', { level: 1, name: 'New invoice' });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(window.location.search).toContain('create=1');
    expect(window.history.length).toBe(entries + 1); // a double click: one entry
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith({ to: 'create' });
    expect(screen.queryByRole('table')).toBeNull();

    expect(screen.getByRole('textbox', { name: /Invoice number/ })).toHaveProperty('value', 'Assigned on save');
    expect(screen.getByRole('textbox', { name: /Amount/ })).toHaveProperty('value', '');
    expect(screen.getByLabelText('Invoice date')).toHaveProperty('value', '2026-11-09');
    expect(screen.getByLabelText('Due date')).toHaveProperty('value', '2026-12-09');
    expect(screen.getByRole('region', { name: 'Save actions' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(window.location.search).not.toContain('create='));
    expect(await screen.findByRole('table')).toBeTruthy();
  }, 20_000);

  it('an invalid Create does not call store.create; a valid one (double click) calls it once, returns to the list, announces it', async () => {
    const onCreated = vi.fn();
    render(
      <StrictMode>
        <InvoiceCrud {...base({ onCreated })} />
      </StrictMode>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'New invoice' }));
    await screen.findByRole('heading', { level: 1, name: 'New invoice' });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(window.__ropShowcaseStore?.snapshot()).toHaveLength(200);
    expect(screen.getAllByText(/is required|greater than 0/).length).toBeGreaterThan(0);

    await chooseSupplier('Bianchi Supplies');
    await userEvent.type(screen.getByRole('textbox', { name: /Amount/ }), '1295.9');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Create' }));

    // Back on the list: no "Unsaved changes" dialog, the record is in the store, announced once.
    await screen.findByRole('table');
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(window.location.search).not.toContain('create=');
    expect(onCreated).toHaveBeenCalledTimes(1);
    const stored = window.__ropShowcaseStore?.snapshot().filter((r) => r.number === 'FT-2026-0201');
    expect(stored).toHaveLength(1);
    expect(stored?.[0]).toMatchObject({ supplier: 'Bianchi Supplies', amount: 1295.9, status: 'pending', date: '2026-11-09' });
    expect(await screen.findByText('Invoice FT-2026-0201 created')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('link', { name: 'FT-2026-0201' })).toBe(document.activeElement));
  }, 20_000);

  it('a Create hidden by the filters says so and focuses the title', async () => {
    window.history.replaceState(null, '', '/?filter=approved');
    render(
      <StrictMode>
        <InvoiceCrud {...base()} />
      </StrictMode>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'New invoice' }));
    await chooseSupplier('Bianchi Supplies');
    await userEvent.type(screen.getByRole('textbox', { name: /Amount/ }), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Not shown with the current filters.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'FT-2026-0201' })).toBeNull();
    await waitFor(() => expect(document.activeElement?.tagName).toBe('H2'));
  }, 20_000);

  it('saveOutcome error: stays on the page with the values and the error, nothing created, Create usable again', async () => {
    render(<InvoiceCrud {...base({ saveOutcome: 'error' })} />);
    await userEvent.click(await screen.findByRole('button', { name: 'New invoice' }));
    await chooseSupplier('Bianchi Supplies');
    await userEvent.type(screen.getByRole('textbox', { name: /Amount/ }), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText(/network error/i)).toBeTruthy();
    expect(window.location.search).toContain('create=1');
    expect(screen.getByRole('textbox', { name: /Amount/ })).toHaveProperty('value', '10');
    expect(window.__ropShowcaseStore?.snapshot()).toHaveLength(200);
    expect(screen.getByRole('button', { name: 'Create' }).getAttribute('aria-disabled')).toBeNull();
  }, 20_000);

  it('with edits, Cancel asks; "Keep editing" keeps them, "Discard changes" leaves without creating', async () => {
    render(<InvoiceCrud {...base()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'New invoice' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'draft');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveProperty('value', 'draft');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(window.location.search).not.toContain('create='));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(window.__ropShowcaseStore?.snapshot()).toHaveLength(200);
  }, 20_000);

  it('leaving with a Create in flight ("Leave anyway"): the list shows the new record, onCreated once', async () => {
    const { promise, release } = gate();
    const onCreated = vi.fn();
    render(<InvoiceCrud {...base({ saveDelayMs: promise, onCreated })} />);
    await userEvent.click(await screen.findByRole('button', { name: 'New invoice' }));
    await chooseSupplier('Bianchi Supplies');
    await userEvent.type(screen.getByRole('textbox', { name: /Amount/ }), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('button', { name: 'Create' }).getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/A save is still in progress/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Leave anyway' }));
    await waitFor(() => expect(window.location.search).not.toContain('create='));
    expect(onCreated).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('link', { name: 'FT-2026-0201' }, { timeout: 5000 })).toBeTruthy();
  }, 20_000);

  it('deep link ?create=1: Cancel replaces the entry with the list (no history entry added or lost)', async () => {
    window.history.replaceState(null, '', '/?filter=open&create=1');
    const entries = window.history.length;
    render(<InvoiceCrud {...base()} />);
    await screen.findByRole('heading', { level: 1, name: 'New invoice' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(window.location.search).toBe('?filter=open');
    expect(window.history.length).toBe(entries);
  }, 20_000);
});
