import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../dialog/Dialog';
import { useDirtyGuard, type UseDirtyGuardOptions } from './use-dirty-guard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Host({ action, ...options }: UseDirtyGuardOptions & { action: () => void }) {
  const { guard, dialog } = useDirtyGuard(options);
  return (
    <>
      <button onClick={() => guard(action)}>Torna alla lista</button>
      {dialog}
    </>
  );
}

const beforeUnloadCalls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter((call) => call[0] === 'beforeunload');

describe('useDirtyGuard: beforeunload', () => {
  it('registers nothing while when is false', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render(<Host when={false} action={vi.fn()} />);
    expect(beforeUnloadCalls(add)).toHaveLength(0);
  });

  it('registers a listener that prevents default and sets returnValue while when is true', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render(<Host when action={vi.fn()} />);
    expect(beforeUnloadCalls(add)).toHaveLength(1);
    // Own property: in a browser `returnValue` of a BeforeUnloadEvent is a string, jsdom's plain Event has a boolean.
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(event, 'returnValue', { value: 'unset', writable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe('');
  });

  it('removes the listener when when turns false, and on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender, unmount } = render(<Host when action={vi.fn()} />);
    rerender(<Host when={false} action={vi.fn()} />);
    expect(beforeUnloadCalls(remove)).toHaveLength(1);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    rerender(<Host when action={vi.fn()} />);
    unmount();
    expect(beforeUnloadCalls(remove)).toHaveLength(2);
  });

  it('two hooks keep independent listeners: unmounting one does not remove the other', () => {
    const first = render(<Host when action={vi.fn()} />);
    render(<Host when action={vi.fn()} />);
    first.unmount();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('toggling when quickly leaves a single listener at a time, also in StrictMode', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender } = render(
      <StrictMode>
        <Host when action={vi.fn()} />
      </StrictMode>,
    );
    for (const when of [false, true, false, true]) {
      rerender(
        <StrictMode>
          <Host when={when} action={vi.fn()} />
        </StrictMode>,
      );
    }
    const live = beforeUnloadCalls(add).length - beforeUnloadCalls(remove).length;
    expect(live).toBe(1);
  });
});

describe('useDirtyGuard: guard', () => {
  it('runs the action synchronously with no dialog when when is false', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<Host when={false} action={action} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('runs the action synchronously inside guard (same tick)', () => {
    let ran = false;
    function Probe() {
      const { guard } = useDirtyGuard({ when: false });
      guard(() => {
        ran = true;
      });
      return null;
    }
    render(<Probe />);
    expect(ran).toBe(true);
  });

  it('does not run the action and opens a modal dialog named and described when when is true', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<Host when action={action} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    expect(action).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(/leaving now will lose them/);
  });

  it('puts the initial focus on "Keep editing"', async () => {
    const user = userEvent.setup();
    render(<Host when action={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus());
  });

  it('"Keep editing" closes without running the action', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<Host when action={action} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it('Escape and the close button are equivalent to "Keep editing"', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<Host when action={action} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    await user.click(screen.getByRole('button', { name: 'Close: Unsaved changes' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it('after "stay" a new guard call opens the dialog again and "leave" runs the action once', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<Host when action={action} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('runs the action after the dialog has been closed in the DOM', async () => {
    const user = userEvent.setup();
    let dialogsWhenRun = -1;
    const action = () => {
      dialogsWhenRun = document.querySelectorAll('[role=dialog]').length;
    };
    render(<Host when action={action} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(dialogsWhenRun).toBe(0);
  });

  it('a second guard call with the dialog open is ignored: the first action stays pending', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    function Two() {
      const { guard, dialog } = useDirtyGuard({ when: true });
      return (
        <>
          <button onClick={() => guard(first)}>Prima</button>
          <button onClick={() => guard(second)}>Seconda</button>
          {dialog}
        </>
      );
    }
    render(<Two />);
    await user.click(screen.getByRole('button', { name: 'Prima' }));
    // The page is inert behind the modal: call guard from a native event on the (hidden) button.
    act(() => screen.getByRole('button', { name: 'Seconda', hidden: true }).click());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('when turning false with the dialog open leaves it open; "leave" still runs the action', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    const { rerender } = render(<Host when action={action} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    rerender(<Host when={false} action={action} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a throwing action: the dialog is closed, the state is clean and the next guard works', async () => {
    const user = userEvent.setup();
    const boom = new Error('boom');
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let throwing = true;
    const action = vi.fn(() => {
      if (throwing) throw boom;
    });
    render(<Host when action={action} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    window.removeEventListener('error', onError);
    expect(action).toHaveBeenCalledTimes(1);
    expect(errors).toContain(boom);
    expect(screen.queryByRole('dialog')).toBeNull();
    throwing = false;
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('guard has a stable identity across renders and a change of when', () => {
    const seen: unknown[] = [];
    function Probe({ when }: { when: boolean }) {
      seen.push(useDirtyGuard({ when }).guard);
      return null;
    }
    const { rerender } = render(<Probe when={false} />);
    rerender(<Probe when />);
    rerender(<Probe when={false} />);
    expect(new Set(seen).size).toBe(1);
  });

  it('unmounting with the dialog open drops the action and leaves nothing behind', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    const { unmount } = render(<Host when action={action} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    unmount();
    expect(action).not.toHaveBeenCalled();
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
    expect(document.querySelectorAll('[data-aria-hidden]')).toHaveLength(0);
  });
});

describe('useDirtyGuard: labels and DOM', () => {
  it('overrides every text through labels; unspecified keys keep the default', async () => {
    const user = userEvent.setup();
    render(
      <Host
        when
        action={vi.fn()}
        labels={{ title: 'Unsaved', description: 'Lose changes?', stay: 'Keep editing', leave: 'Discard' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved' })).toHaveAccessibleDescription('Lose changes?');
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('a partial labels object (undefined value included) falls back per key', async () => {
    const user = userEvent.setup();
    render(<Host when action={vi.fn()} labels={{ leave: 'Scarta', stay: undefined }} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    expect(screen.getByRole('button', { name: 'Scarta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
  });

  it('control props never reach the DOM', async () => {
    const user = userEvent.setup();
    render(<Host when action={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    const dialog = screen.getByRole('dialog');
    const names = [dialog, ...Array.from(dialog.querySelectorAll('*'))].flatMap((el) => el.getAttributeNames());
    for (const forbidden of ['when', 'labels', 'open', 'size', 'dismissible', 'returnfocusref']) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('labels.close names the X verbatim; no node of the dialog contains the default "Close:"', async () => {
    const user = userEvent.setup();
    render(
      <Host
        when
        action={vi.fn()}
        labels={{ title: 'Unsaved', description: 'Lose changes?', stay: 'Keep', leave: 'Discard', close: ' Close ' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[aria-label=" Close "]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    const nodes = [dialog, ...Array.from(dialog.querySelectorAll('*'))];
    for (const node of nodes) {
      expect(node.textContent ?? '').not.toContain('Close:');
      for (const attr of node.getAttributeNames()) expect(node.getAttribute(attr)).not.toContain('Close:');
    }
    // the key never leaks as an attribute
    expect(nodes.flatMap((el) => el.getAttributeNames())).not.toContain('close');
  });

  it.each([
    ['absent', {}],
    ['undefined', { close: undefined }],
    ['empty', { close: '' }],
    ['whitespace', { close: '   ' }],
  ])('close %s keeps the default name "Close: <title>" and no nameless button', async (_n, labels) => {
    const user = userEvent.setup();
    render(<Host when action={vi.fn()} labels={labels} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    expect(screen.getByRole('button', { name: 'Close: Unsaved changes' })).toBeInTheDocument();
    for (const b of screen.getByRole('dialog').querySelectorAll('button')) {
      expect(b.getAttribute('aria-label') ?? b.textContent ?? '').not.toBe('');
    }
  });

  it('the X with labels.close still means stay and returns the focus to the opener', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<Host when action={action} labels={{ close: 'Close' }} />);
    const opener = screen.getByRole('button', { name: 'Torna alla lista' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(action).not.toHaveBeenCalled();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('a close label that changes while the dialog is open updates the X name', async () => {
    const user = userEvent.setup();
    function Changing() {
      const [close, setClose] = useState('Close');
      return (
        <>
          <button onClick={() => setClose('Dismiss')}>rename</button>
          <Host when action={vi.fn()} labels={{ close }} />
        </>
      );
    }
    render(<Changing />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'rename', hidden: true }).click();
    });
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('a confirmation stacked in another Dialog: the two X have distinct names', async () => {
    const user = userEvent.setup();
    function Nested() {
      const { guard, dialog } = useDirtyGuard({ when: true, labels: { close: 'Close confirmation' } });
      return (
        <Dialog open>
          <DialogContent>
            <DialogTitle>Esterno</DialogTitle>
            <DialogDescription>Descrizione</DialogDescription>
            <DialogClose />
            <button onClick={() => guard(vi.fn())}>Chiudi pagina</button>
            {dialog}
          </DialogContent>
        </Dialog>
      );
    }
    render(<Nested />);
    await user.click(screen.getByRole('button', { name: 'Chiudi pagina' }));
    expect(screen.getByRole('button', { name: 'Close confirmation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close: Esterno', hidden: true })).toBeInTheDocument();
  });

  it('the two actions have distinct accessible names, distinct from a save-bar "Annulla"', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Annulla</button>
        <Host when action={vi.fn()} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(expect.arrayContaining(['Keep editing', 'Leave without saving']));
    expect(screen.getAllByRole('button', { name: 'Annulla', hidden: true })).toHaveLength(1);
    expect(screen.getByRole('dialog').querySelectorAll('button')).toHaveLength(3);
  });
});

describe('useDirtyGuard: other overlays and real DOM bookkeeping', () => {
  it('opens on top of another open Dialog: Escape closes only the confirmation', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    function Nested() {
      const { guard, dialog } = useDirtyGuard({ when: true });
      const [outer, setOuter] = useState(true);
      return (
        <Dialog open={outer} onOpenChange={setOuter}>
          <DialogContent>
            <DialogTitle>Esterno</DialogTitle>
            <DialogDescription>Descrizione</DialogDescription>
            <button onClick={() => guard(action)}>Chiudi pagina</button>
            {dialog}
          </DialogContent>
        </Dialog>
      );
    }
    render(<Nested />);
    await user.click(screen.getByRole('button', { name: 'Chiudi pagina' }));
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Esterno' })).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('opened from state: the page is inert and the scroll locked while open, released after', async () => {
    const user = userEvent.setup();
    render(<Host when action={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Torna alla lista' }));
    expect(screen.queryByRole('button', { name: 'Torna alla lista' })).toBeNull();
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(true);
    await user.keyboard('{Escape}');
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
    expect(screen.getByRole('button', { name: 'Torna alla lista' })).toBeInTheDocument();
  });
});
