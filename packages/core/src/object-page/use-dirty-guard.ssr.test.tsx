// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useDirtyGuard } from './use-dirty-guard';

function Demo() {
  const { guard, dialog } = useDirtyGuard({ when: true });
  return (
    <main>
      <button onClick={() => guard(() => undefined)}>Torna alla lista</button>
      {dialog}
    </main>
  );
}

describe('useDirtyGuard SSR', () => {
  it('renders on the server with the dialog closed and no errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(<Demo />);
    expect(html).toContain('Torna alla lista');
    expect(html).not.toContain('Unsaved changes');
    expect(error).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
