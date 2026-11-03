// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './ToastProvider';
import { useToast } from './use-toast';

function Child() {
  useToast();
  return <p>child</p>;
}

describe('ToastProvider on the server', () => {
  it('renders its children without touching document and without errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(
      <ToastProvider>
        <Child />
      </ToastProvider>,
    );
    expect(html).toContain('<p>child</p>');
    // The live regions are created on the client (they live in a portal on document.body).
    expect(html).not.toContain('aria-live');
    expect(error).not.toHaveBeenCalled();
  });
});
