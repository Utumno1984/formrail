// @vitest-environment node
// `useTanStackFormBinding` on the server (ticket #508): `renderToString` of a form with the binding, the Change
// Summary and the rebase hook, with no `window` / `document` (any access would throw a ReferenceError here).
import { renderToString } from 'react-dom/server';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase } from '../../engine';
import { useTanStackFormBinding } from './use-tanstack-form-binding';

type Invoice = { supplier: string; amount: string };

function InvoiceForm({ saved }: { saved: Invoice }) {
  const form = useForm({ defaultValues: saved });
  const binding = useTanStackFormBinding(form);
  const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { conflicts, isPending } = useFormRebase(binding);
  return (
    <form>
      <form.Field name="supplier">{(field) => <input aria-label="Supplier" value={field.state.value} readOnly />}</form.Field>
      <p>{`${entries.length} changes, ${conflicts.length} conflicts, ${isPending ? 'pending' : 'idle'}, ${binding.values === binding.baseline ? 'same' : 'other'}`}</p>
    </form>
  );
}

describe('useTanStackFormBinding on the server', () => {
  it('renders with renderToString, without window or document', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const html = renderToString(<InvoiceForm saved={{ supplier: 'Lumen Parts', amount: '10' }} />);
    expect(html).toContain('0 changes, 0 conflicts, idle, same');
    expect(html).toContain('value="Lumen Parts"');
  });
});
