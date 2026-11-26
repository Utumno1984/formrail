import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useEffect, useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { useObjectPageForm } from './use-object-page-form';

// The two hydration patterns of the article `site-root/articles/async-hydration-without-false-modified.html`
// (#699), with the real Input and a promise per request standing in for the network. The components below are the
// article's snippets with a spy on the change handler; the article's code is compiled by
// `scripts/article-snippets.test.mjs`, its behaviour is proved here, with and without StrictMode.

afterEach(cleanup);

interface Invoice {
  id: string;
  customer: string;
  reference: string;
}

const INVOICES: Record<string, Invoice> = {
  a: { id: 'a', customer: 'Rossi Construction', reference: 'PO-2026-118' },
  b: { id: 'b', customer: 'Bianchi Logistics', reference: 'PO-2026-204' },
};

interface Request {
  id: string;
  resolve: (invoice: Invoice) => void;
}

/** A data layer where the test decides when (and in which order) each request is answered. */
function network() {
  const requests: Request[] = [];
  const fetchInvoice = vi.fn(
    (id: string) =>
      new Promise<Invoice>((resolve) => {
        requests.push({ id, resolve });
      }),
  );
  const answer = async (index: number) => {
    const request = requests[index];
    if (!request) throw new Error(`no request #${index}`);
    await act(async () => {
      request.resolve(INVOICES[request.id] as Invoice);
    });
  };
  return { requests, fetchInvoice, answer };
}

// ---- Option one: mount the editor already hydrated -----------------------------------------------------------

function mountedHydrated(fetchInvoice: (id: string) => Promise<Invoice>, onChange: () => void) {
  function InvoiceEditor({ invoice }: { invoice: Invoice }) {
    const form = useObjectPageForm({ baseline: invoice });
    return (
      <form>
        <Field label="Customer" name="customer">
          <Input
            value={form.values.customer}
            onChange={(event) => {
              onChange();
              form.setValue('customer', event.target.value);
            }}
          />
        </Field>
        <p>{form.isDirty ? 'Unsaved changes' : 'Saved'}</p>
      </form>
    );
  }

  return function InvoicePage({ id }: { id: string }) {
    const [loaded, setLoaded] = useState<Invoice | null>(null);
    useEffect(() => {
      let ignore = false;
      void fetchInvoice(id).then((invoice) => {
        if (!ignore) setLoaded(invoice);
      });
      return () => {
        ignore = true;
      };
    }, [id]);
    if (loaded === null || loaded.id !== id) return <p role="status">Loading invoice…</p>;
    return <InvoiceEditor key={loaded.id} invoice={loaded} />;
  };
}

// ---- Option two: hydrate an existing form with reset ---------------------------------------------------------

const EMPTY = { id: '', customer: '', reference: '' };

function hydratedWithReset(fetchInvoice: (id: string) => Promise<Invoice>, onChange: () => void) {
  return function InvoicePage({ id }: { id: string }) {
    const form = useObjectPageForm<Invoice>({ baseline: EMPTY });
    const { reset } = form;
    const loading = form.baseline === EMPTY;
    useEffect(() => {
      let ignore = false;
      void fetchInvoice(id).then((invoice) => {
        if (!ignore) reset(invoice);
      });
      return () => {
        ignore = true;
      };
    }, [id, reset]);
    return (
      <form>
        <Field label="Customer" name="customer">
          <Input
            disabled={loading}
            value={form.values.customer}
            onChange={(event) => {
              onChange();
              form.setValue('customer', event.target.value);
            }}
          />
        </Field>
        <p>{form.isDirty ? 'Unsaved changes' : 'Saved'}</p>
      </form>
    );
  };
}

// Not a wrapper component: StrictMode must be a direct element of the rendered tree for React to run the effects
// twice (inside a function component's output it did not, with React 19.3 and Testing Library).
const modes: Array<[string, (ui: ReactElement) => ReactElement, number]> = [
  ['plain', (ui) => ui, 1],
  ['StrictMode', (ui) => <StrictMode>{ui}</StrictMode>, 2],
];

describe.each(modes)('async hydration (%s)', (_name, wrap, requestsAtMount) => {
  describe('option one: the editor is mounted already hydrated', () => {
    it('shows a loading state with no field, then the record with a clean form, however many requests StrictMode made', async () => {
      const net = network();
      const onChange = vi.fn();
      const InvoicePage = mountedHydrated(net.fetchInvoice, onChange);
      render(
        wrap(<InvoicePage id="a" />),
      );
      expect(screen.getByRole('status')).toHaveTextContent('Loading invoice…');
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(net.fetchInvoice).toHaveBeenCalledTimes(requestsAtMount);

      // Every request is answered, the first one first: under StrictMode the first belongs to an effect that was
      // cleaned up, so it must not mount anything; the last one does.
      for (let i = 0; i < requestsAtMount - 1; i += 1) {
        await net.answer(i);
        expect(screen.queryByRole('textbox')).toBeNull();
      }
      await net.answer(requestsAtMount - 1);

      expect(screen.getByRole('textbox', { name: 'Customer' })).toHaveValue('Rossi Construction');
      expect(screen.getByText('Saved')).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('the form is modified by an edit and clean again when the saved value is typed back', async () => {
      const net = network();
      const InvoicePage = mountedHydrated(net.fetchInvoice, vi.fn());
      render(
        wrap(<InvoicePage id="a" />),
      );
      await net.answer(requestsAtMount - 1);
      const user = userEvent.setup();
      const customer = screen.getByRole('textbox', { name: 'Customer' });
      await user.type(customer, '!');
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
      await user.type(customer, '{Backspace}');
      expect(customer).toHaveValue('Rossi Construction');
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });

    it('another record is another editor: the old one is not shown while the new one loads, and the new one is clean', async () => {
      const net = network();
      const InvoicePage = mountedHydrated(net.fetchInvoice, vi.fn());
      const { rerender } = render(
        wrap(<InvoicePage id="a" />),
      );
      await net.answer(requestsAtMount - 1);
      await userEvent.setup().type(screen.getByRole('textbox', { name: 'Customer' }), '!');
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

      const before = net.requests.length;
      rerender(
        wrap(<InvoicePage id="b" />),
      );
      expect(screen.getByRole('status')).toHaveTextContent('Loading invoice…');
      expect(screen.queryByRole('textbox')).toBeNull();
      await net.answer(net.requests.length - 1);
      expect(net.requests.length).toBeGreaterThan(before);
      expect(screen.getByRole('textbox', { name: 'Customer' })).toHaveValue('Bianchi Logistics');
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  describe('option two: reset(record) on an existing form', () => {
    it('keeps the control disabled until the record arrives, then shows it with a clean form and no change reported', async () => {
      const net = network();
      const onChange = vi.fn();
      const InvoicePage = hydratedWithReset(net.fetchInvoice, onChange);
      render(
        wrap(<InvoicePage id="a" />),
      );
      expect(screen.getByRole('textbox', { name: 'Customer' })).toBeDisabled();
      expect(net.fetchInvoice).toHaveBeenCalledTimes(requestsAtMount);
      for (let i = 0; i < requestsAtMount; i += 1) await net.answer(i);

      const customer = screen.getByRole('textbox', { name: 'Customer' });
      expect(customer).toBeEnabled();
      expect(customer).toHaveValue('Rossi Construction');
      expect(screen.getByText('Saved')).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();

      await userEvent.setup().type(customer, '!');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });

    it('drops a response that arrives after the one for the record now on screen', async () => {
      const net = network();
      const InvoicePage = hydratedWithReset(net.fetchInvoice, vi.fn());
      const { rerender } = render(
        wrap(<InvoicePage id="a" />),
      );
      const first = net.requests.length;
      rerender(
        wrap(<InvoicePage id="b" />),
      );
      expect(net.requests.length).toBeGreaterThan(first);
      // "b" answers first, the slow responses for "a" arrive afterwards: they must not overwrite it.
      await net.answer(net.requests.length - 1);
      for (let i = 0; i < first; i += 1) await net.answer(i);
      expect(screen.getByRole('textbox', { name: 'Customer' })).toHaveValue('Bianchi Logistics');
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });
});

// ---- What the article says about the comparison --------------------------------------------------------------

describe('the flag is a comparison against the baseline', () => {
  const saved = { customer: 'Rossi Construction', reference: 'po-2026-118' };

  it('pouring the data into a form whose baseline is the empty placeholder is modified (the naive pattern); reset is not', () => {
    const empty = { customer: '', reference: '' };
    const naive = renderHook(() => useObjectPageForm({ baseline: empty }));
    act(() => naive.result.current.setValues(saved));
    expect(naive.result.current.isDirty).toBe(true);

    const hydrated = renderHook(() => useObjectPageForm({ baseline: empty }));
    act(() => hydrated.result.current.reset(saved));
    expect(hydrated.result.current.isDirty).toBe(false);
  });

  it('a value equal to the baseline is no change: no modification and no re-render', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useObjectPageForm({ baseline: saved });
    });
    const before = renders;
    act(() => result.current.setValue('reference', 'po-2026-118'));
    expect(result.current.isDirty).toBe(false);
    expect(renders).toBe(before);
  });

  it('a control that reports a normalized value makes the form modified; a normalized baseline or isEqual does not', () => {
    const echo = (form: { setValue: (name: 'reference', value: string) => void }) => form.setValue('reference', 'PO-2026-118');

    const strict = renderHook(() => useObjectPageForm({ baseline: saved }));
    act(() => echo(strict.result.current));
    expect(strict.result.current.isDirty).toBe(true);

    const normalizedBaseline = renderHook(() => useObjectPageForm({ baseline: { ...saved, reference: 'PO-2026-118' } }));
    act(() => echo(normalizedBaseline.result.current));
    expect(normalizedBaseline.result.current.isDirty).toBe(false);

    const normalize = (value: string) => value.trim().toUpperCase();
    const withIsEqual = renderHook(() =>
      useObjectPageForm({ baseline: saved, isEqual: (a, b) => a.customer === b.customer && normalize(a.reference) === normalize(b.reference) }),
    );
    act(() => echo(withIsEqual.result.current));
    expect(withIsEqual.result.current.isDirty).toBe(false);
    // isEqual decides only isDirty: the value is the one the control reported.
    expect(withIsEqual.result.current.values.reference).toBe('PO-2026-118');
    expect(withIsEqual.result.current.baseline.reference).toBe('po-2026-118');
  });

  it('a late reset replaces what the user typed before the data arrived', () => {
    const { result } = renderHook(() => useObjectPageForm({ baseline: { customer: '', reference: '' } }));
    act(() => result.current.setValue('customer', 'typed too early'));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.reset(saved));
    expect(result.current.values).toEqual(saved);
    expect(result.current.isDirty).toBe(false);
  });
});
