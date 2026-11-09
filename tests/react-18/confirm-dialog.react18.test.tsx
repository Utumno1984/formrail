import { act, StrictMode, useState, version } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConfirmDialog, useConfirmDialog, type ConfirmOptions } from '../../packages/core/src';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const frame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const button = (name: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent === name) as HTMLButtonElement;

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('ConfirmDialog on React 18', () => {
  it('runs against React 18', () => {
    expect(version.startsWith('18.')).toBe(true);
  });

  it('opens with the focus on Cancel, waits for a pending onConfirm (one call), closes and returns the focus', async () => {
    const errors = vi.spyOn(console, 'error');
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Delete…
          </button>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Delete invoice?"
            description="This cannot be undone."
            confirmLabel="Delete invoice"
            onConfirm={onConfirm}
          />
        </>
      );
    }
    act(() =>
      root.render(
        <StrictMode>
          <Host />
        </StrictMode>,
      ),
    );
    const opener = button('Delete…');
    opener.focus();
    act(() => opener.click());
    await frame();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(button('Cancel'));

    const confirm = button('Delete invoice');
    confirm.focus();
    act(() => confirm.click());
    act(() => confirm.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(confirm);

    await act(async () => finish());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await frame();
    expect(document.activeElement).toBe(opener);
    expect(errors).not.toHaveBeenCalled();
  });

  it('useConfirmDialog resolves true / false, and false on unmount', async () => {
    const answers: boolean[] = [];
    let ask!: (o: ConfirmOptions) => Promise<boolean>;
    function Page() {
      const [confirm, confirmDialog] = useConfirmDialog();
      ask = confirm;
      return <>{confirmDialog}</>;
    }
    act(() => root.render(<Page />));
    const opts: ConfirmOptions = { title: 'Delete?', confirmLabel: 'Delete invoice' };

    act(() => void ask(opts).then((ok) => answers.push(ok)));
    act(() => button('Delete invoice').click());
    await act(() => Promise.resolve());

    act(() => void ask(opts).then((ok) => answers.push(ok)));
    act(() => button('Cancel').click());
    await act(() => Promise.resolve());

    act(() => void ask(opts).then((ok) => answers.push(ok)));
    act(() => root.render(<></>));
    await act(() => Promise.resolve());
    expect(answers).toEqual([true, false, false]);
  });
});
