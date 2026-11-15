// @vitest-environment node
// `useReactHookFormBinding` on the server (ticket #507): `renderToString` of a form with the binding, the Change
// Summary and the rebase hook, with no `window` / `document` (any access would throw a ReferenceError here).
import { renderToString } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { useChangeSummary, useFormRebase } from '../../engine';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

type Invoice = { supplier: string; amount: string };

function InvoiceForm({ saved }: { saved: Invoice }) {
  const form = useForm<Invoice>({ defaultValues: saved });
  const binding = useReactHookFormBinding(form);
  const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { conflicts, isPending } = useFormRebase(binding);
  return (
    <form>
      <input aria-label="Supplier" {...form.register('supplier')} />
      <p>{`${entries.length} changes, ${conflicts.length} conflicts, ${isPending ? 'pending' : 'idle'}, ${binding.values === binding.baseline ? 'same' : 'other'}`}</p>
    </form>
  );
}

describe('useReactHookFormBinding on the server', () => {
  it('renders with renderToString, without window or document', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const html = renderToString(<InvoiceForm saved={{ supplier: 'Acme', amount: '10' }} />);
    expect(html).toContain('0 changes, 0 conflicts, idle, same');
  });
});
