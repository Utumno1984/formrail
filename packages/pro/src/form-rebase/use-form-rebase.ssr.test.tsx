// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useObjectPageForm } from '@react-object-page/core';
import { useFormRebase } from './use-form-rebase';

type Form = { name: string; amount: number };
const SERVER: Form = { name: 'Server', amount: 20 };

function Demo() {
  const form = useObjectPageForm<Form>({ baseline: { name: 'ACME', amount: 10 } });
  const rebase = useFormRebase(form, { labels: { name: 'Supplier name' } });
  // A call during render (data already there on the server) must not throw nor loop.
  rebase.rebase(SERVER);
  return (
    <form>
      <input readOnly value={form.values.name} />
      <output>{rebase.isPending ? 'pending' : 'idle'}</output>
      <output>{`conflicts:${rebase.conflicts.length}`}</output>
    </form>
  );
}

describe('useFormRebase SSR', () => {
  it('renders on the server without window/document and without errors or warnings', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = renderToString(<Demo />);
    expect(html).toContain('value="ACME"');
    expect(html).toContain('idle');
    expect(html).toContain('conflicts:0');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
