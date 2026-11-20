// @vitest-environment node
// #583: `confirmDisabledReason` on the server. Its id comes from `useId` (stable between the server and the client),
// and nothing of the dialog touches `document` while rendering.
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { useConfirmDialog } from './use-confirm-dialog';

function HookPage() {
  const [, element] = useConfirmDialog();
  return <main>{element}</main>;
}

describe('ConfirmDialog on the server', () => {
  it('open, with a confirmDisabledReason: renders without touching document and without errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(
      <main>
        <ConfirmDialog
          open
          onOpenChange={() => undefined}
          title="Review changes"
          confirmLabel="Save changes"
          onConfirm={() => undefined}
          confirmDisabledReason="This sales order was deleted on the server: it can no longer be saved."
        />
      </main>,
    );
    expect(html).toContain('<main>');
    // The panel lives in a portal on document.body: created on the client, so the reason is not in the HTML,
    // and the prop is never serialized as an attribute.
    expect(html).not.toContain('confirmDisabledReason');
    expect(html.toLowerCase()).not.toContain('confirmdisabledreason');
    expect(error).not.toHaveBeenCalled();
  });

  it('the useConfirmDialog element renders on the server too', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(renderToString(<HookPage />)).toContain('<main>');
    expect(error).not.toHaveBeenCalled();
  });
});
