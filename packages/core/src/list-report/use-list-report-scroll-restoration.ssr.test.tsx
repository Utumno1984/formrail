// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// A static import: if the module touched `window` while loading, this file would fail before any test.
import { useListReportScrollRestoration } from './use-list-report-scroll-restoration';

function Page() {
  const scroll = useListReportScrollRestoration({ ready: true });
  return <div ref={scroll.ref}>table</div>;
}

describe('useListReportScrollRestoration on the server (node environment, no DOM globals)', () => {
  it('renders without touching window or storage, with no warning', () => {
    expect(typeof window).toBe('undefined');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(renderToString(<Page />)).toContain('table');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });
});
