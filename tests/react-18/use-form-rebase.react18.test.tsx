import { act, version, type ReactElement } from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useObjectPageForm, type UseObjectPageFormReturn } from '../../packages/core/src';
import { useFormRebase, type UseFormRebaseReturn } from '../../packages/pro/src';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Invoice = { number: string; amount: number; notes: string };
const BASE: Invoice = { number: 'A-1', amount: 10, notes: '' };

interface Seen {
  form: UseObjectPageFormReturn<Invoice>;
  rebase: UseFormRebaseReturn<Invoice>;
}

function Probe({ seen }: { seen: Seen[] }) {
  const form = useObjectPageForm<Invoice>({ baseline: BASE });
  const rebase = useFormRebase(form);
  seen.push({ form, rebase });
  return <output>{form.values.amount}</output>;
}

const legacyRender = (ReactDOM as unknown as { render: (el: ReactElement, c: Element) => void }).render;
const legacyUnmount = (ReactDOM as unknown as { unmountComponentAtNode: (c: Element) => void }).unmountComponentAtNode;

describe('useFormRebase on React 18', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('runs against React 18', () => {
    expect(version.startsWith('18.')).toBe(true);
  });

  it.each(['createRoot', 'legacy render'] as const)('%s: merge applied in one render, never clean in between', (mode) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // legacy render deprecation notice
    const container = document.createElement('div');
    document.body.appendChild(container);
    const seen: Seen[] = [];
    const root = mode === 'createRoot' ? createRoot(container) : undefined;
    act(() => {
      if (root) root.render(<Probe seen={seen} />);
      else legacyRender(<Probe seen={seen} />, container);
    });
    const last = () => seen.at(-1) as Seen;
    act(() => last().form.setValue('number', 'A-2'));
    const from = seen.length;
    const incoming: Invoice = { ...BASE, number: 'A-3', amount: 30 };
    act(() => last().rebase.rebase(incoming));
    const after = seen.slice(from);
    expect(after.every((s) => s.form.isDirty)).toBe(true);
    expect(after.some((s) => s.form.values === incoming)).toBe(false);
    expect(last().form.baseline).toBe(incoming);
    expect(last().form.values).toEqual({ ...BASE, number: 'A-2', amount: 30 });
    expect(last().rebase.conflicts.map((c) => c.path)).toEqual(['number']);
    expect(container.textContent).toBe('30');
    act(() => {
      if (root) root.unmount();
      else legacyUnmount(container);
    });
  });
});
