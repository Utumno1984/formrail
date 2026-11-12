import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReturnFocus } from './use-return-focus';

afterEach(() => cleanup());
const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

interface HostProps {
  open: boolean;
  /** `undefined`: no `opener` option at all. */
  toTrigger?: boolean;
  onOpenerRead?: () => void;
}

/**
 * A trigger that does not take the focus when pressed (as a Radix menu trigger on a pointer press):
 * "elsewhere" still has the focus when the overlay opens. `opener` names the trigger (#463).
 */
function Host({ open, toTrigger, onOpenerRead }: HostProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  useReturnFocus({
    open,
    opener:
      toTrigger === undefined
        ? undefined
        : () => {
            onOpenerRead?.();
            return toTrigger ? triggerRef.current : null;
          },
  });
  return (
    <>
      <button data-testid="elsewhere">elsewhere</button>
      <button ref={triggerRef} data-testid="trigger">
        trigger
      </button>
      {open && <button data-testid="inside">inside</button>}
    </>
  );
}

function setup(props: Omit<HostProps, 'open'>) {
  const view = render(<Host open={false} {...props} />);
  const get = (id: string) => view.getByTestId(id);
  const set = (open: boolean) => view.rerender(<Host open={open} {...props} />);
  return { get, set };
}

describe('useReturnFocus opener', () => {
  it('without it the focused element is the opener, as ever', async () => {
    const { get, set } = setup({});
    act(() => get('elsewhere').focus());
    set(true);
    act(() => get('inside').focus());
    set(false);
    await nextFrame();
    expect(document.activeElement).toBe(get('elsewhere'));
  });

  it('an element returned at the opening is the opener, not the focused element', async () => {
    const { get, set } = setup({ toTrigger: true });
    act(() => get('elsewhere').focus());
    set(true);
    act(() => get('inside').focus());
    set(false);
    await nextFrame();
    expect(document.activeElement).toBe(get('trigger'));
  });

  it('null at the opening: the focused element is the opener', async () => {
    const { get, set } = setup({ toTrigger: false });
    act(() => get('elsewhere').focus());
    set(true);
    act(() => get('inside').focus());
    set(false);
    await nextFrame();
    expect(document.activeElement).toBe(get('elsewhere'));
  });

  it('is read once per opening, at the opening (not while open, not at the close)', async () => {
    const read = vi.fn();
    const { get, set } = setup({ toTrigger: true, onOpenerRead: read });
    expect(read).not.toHaveBeenCalled();
    act(() => get('elsewhere').focus());
    set(true);
    expect(read).toHaveBeenCalledTimes(1);
    act(() => get('inside').focus());
    set(false);
    await nextFrame();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('wins over a pending return: reopened by the trigger before the frame, the trigger becomes the opener', async () => {
    // The first opening names no explicit opener ("elsewhere", the focused element, is the opener);
    // the reopening, while the first close's return is still pending, names the trigger. The callback
    // reads a mutable value, as `Menu` reads its `openedBy` ref (see the hook's `opener` docs).
    const pick: { current: 'trigger' | null } = { current: null };
    function Switching({ open }: { open: boolean }) {
      const triggerRef = useRef<HTMLButtonElement>(null);
      useReturnFocus({ open, opener: () => (pick.current === 'trigger' ? triggerRef.current : null) });
      return (
        <>
          <button data-testid="elsewhere">elsewhere</button>
          <button ref={triggerRef} data-testid="trigger">
            trigger
          </button>
          {open && <button data-testid="inside">inside</button>}
        </>
      );
    }
    const view = render(<Switching open={false} />);
    const get = (id: string) => view.getByTestId(id);
    act(() => get('elsewhere').focus());
    view.rerender(<Switching open />);
    act(() => get('inside').focus());
    view.rerender(<Switching open={false} />); // schedules a return to "elsewhere"
    pick.current = 'trigger';
    view.rerender(<Switching open />); // reopened before that frame, by the trigger
    act(() => get('inside').focus());
    view.rerender(<Switching open={false} />);
    await nextFrame();
    expect(document.activeElement).toBe(get('trigger'));
  });
});
