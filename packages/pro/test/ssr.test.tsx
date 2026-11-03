// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { useChangeSummary } from '../src/index';

type Invoice = { number: string; supplier: { vatNumber: string } };

function Summary({ values, baseline }: { values: Invoice; baseline: Invoice }) {
  const { entries, isEmpty } = useChangeSummary({ values, baseline, labels: { 'supplier.vatNumber': 'VAT number' } });
  return <p>{isEmpty ? 'no changes' : entries.map((e) => `${e.label}: ${e.kind}`).join('; ')}</p>;
}

describe('useChangeSummary on the server', () => {
  it('renders with renderToString without a DOM (no window / document)', () => {
    // Discriminating: any access to window/document would throw a ReferenceError here.
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const baseline: Invoice = { number: 'A-1', supplier: { vatNumber: 'IT1' } };
    const html = renderToString(<Summary baseline={baseline} values={{ ...baseline, supplier: { vatNumber: 'IT2' } }} />);
    expect(html).toBe('<p>Supplier &gt; VAT number: changed</p>');
    expect(renderToString(<Summary baseline={baseline} values={baseline} />)).toBe('<p>no changes</p>');
  });
});
