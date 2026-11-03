import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../input/Input';
import { ToastProvider, type ToastProviderProps } from './ToastProvider';
import { useToast, type ToastOptions, type UseToastReturn } from './use-toast';

let api: UseToastReturn;
function Capture() {
  api = useToast();
  return null;
}

function setup(props: Omit<ToastProviderProps, 'children'> = {}, extra?: React.ReactNode) {
  return render(
    <ToastProvider {...props}>
      <Capture />
      <Input aria-label="Name" />
      <button type="button">Other</button>
      {extra}
    </ToastProvider>,
  );
}

const polite = () => screen.getByRole('status');
const assertive = () => screen.getByRole('alert');
const show = (options: ToastOptions) => {
  let id = '';
  act(() => {
    id = api.show(options);
  });
  return id;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('live regions', () => {
  it('are mounted empty with the provider, before any show', () => {
    setup();
    expect(polite()).toHaveAttribute('aria-live', 'polite');
    expect(assertive()).toHaveAttribute('aria-live', 'assertive');
    expect(polite()).toBeEmptyDOMElement();
    expect(assertive()).toBeEmptyDOMElement();
    expect(polite().closest('body')).toBe(document.body);
  });

  it('receive the message in the same node: polite for success, assertive for error', () => {
    setup();
    const [p, a] = [polite(), assertive()];
    show({ tone: 'success', description: 'Saved' });
    expect(polite()).toBe(p);
    expect(p).toHaveTextContent('Saved');
    expect(a).toBeEmptyDOMElement();
    show({ tone: 'error', description: 'Upload failed' });
    expect(assertive()).toBe(a);
    expect(a).toHaveTextContent('Upload failed');
    expect(p).toBeEmptyDOMElement();
    expect(polite()).toBe(p);
  });

  it('are not rewritten when the component that showed the toast re-renders', () => {
    function Host() {
      const toast = useToast();
      const [n, setN] = useState(0);
      return (
        <>
          <button onClick={() => toast.show({ description: 'Saved' })}>Save</button>
          <button onClick={() => setN(n + 1)}>Rerender {n}</button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Host />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Save'));
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(polite(), { subtree: true, childList: true, characterData: true, attributes: true });
    fireEvent.click(screen.getByText(/Rerender/));
    fireEvent.click(screen.getByText(/Rerender/));
    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(polite()).toHaveTextContent('Saved');
    expect(records).toEqual([]);
  });
});

describe('focus', () => {
  it('never moves from the input when a toast is shown, also from a timer and with an action', () => {
    setup();
    const input = screen.getByLabelText('Name');
    input.focus();
    show({ description: 'Saved' });
    expect(input).toHaveFocus();
    show({ description: 'Undo?', action: { label: 'Undo', onClick: () => undefined } });
    expect(input).toHaveFocus();
    setTimeout(() => api.show({ tone: 'error', description: 'Late' }), 100);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Late')).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('F8 moves the focus to the toast; Tab reaches the action and the close button', () => {
    setup();
    const input = screen.getByLabelText('Name');
    input.focus();
    show({ description: 'Deleted', action: { label: 'Undo', onClick: () => undefined } });
    fireEvent.keyDown(document, { key: 'F8' });
    const toast = polite().firstElementChild as HTMLElement;
    expect(toast).toHaveFocus();
    // Both controls are focusable, in order (the DOM order is the Tab order).
    const controls = Array.from(toast.querySelectorAll<HTMLElement>('button'));
    expect(controls.map((c) => c.textContent || c.getAttribute('aria-label'))).toEqual([
      'Undo',
      'Dismiss notification',
    ]);
    controls.forEach((c) => expect(c.tabIndex).toBe(0));
  });

  it('F8 with no toast does nothing (does not swallow the key)', () => {
    setup();
    const event = new KeyboardEvent('keydown', { key: 'F8', cancelable: true, bubbles: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('the hotkey is configurable and can be turned off', () => {
    const { unmount } = setup({ hotkey: 'F9' });
    show({ description: 'Saved' });
    fireEvent.keyDown(document, { key: 'F8' });
    expect(polite().firstElementChild).not.toHaveFocus();
    fireEvent.keyDown(document, { key: 'F9' });
    expect(polite().firstElementChild).toHaveFocus();
    unmount();
    setup({ hotkey: null });
    show({ description: 'Saved' });
    fireEvent.keyDown(document, { key: 'F8' });
    expect(polite().firstElementChild).not.toHaveFocus();
  });

  it('Escape with the focus inside closes the toast and returns the focus to where it was', () => {
    const onDismiss = vi.fn();
    setup();
    const input = screen.getByLabelText('Name');
    input.focus();
    show({ description: 'Saved', onDismiss });
    fireEvent.keyDown(document, { key: 'F8' });
    const toast = polite().firstElementChild as HTMLElement;
    fireEvent.keyDown(toast, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('user');
    expect(polite()).toBeEmptyDOMElement();
    expect(input).toHaveFocus();
  });

  it('Escape with the focus elsewhere does not close the toast', () => {
    const onDismiss = vi.fn();
    setup();
    const input = screen.getByLabelText('Name');
    input.focus();
    show({ description: 'Saved', onDismiss });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(polite()).toHaveTextContent('Saved');
  });

  it.each(['timeout', 'replaced', 'programmatic'] as const)(
    'a close (%s) while the focus is inside returns it to the previous element, not to body',
    (reason) => {
      setup();
      const input = screen.getByLabelText('Name');
      input.focus();
      show({ description: 'One', duration: 1000 });
      fireEvent.keyDown(document, { key: 'F8' });
      expect(polite().firstElementChild).toHaveFocus();
      act(() => {
        if (reason === 'timeout') vi.advanceTimersByTime(1000);
        else if (reason === 'replaced') api.show({ description: 'Two' });
        else api.dismiss();
      });
      expect(input).toHaveFocus();
    },
  );

  it('a previous element that is disabled or gone is not focused, and nothing arbitrary is', () => {
    const { rerender } = render(
      <ToastProvider>
        <Capture />
        <button key="opener" type="button" data-testid="opener">
          Opener
        </button>
        <button key="other" type="button">
          Other
        </button>
      </ToastProvider>,
    );
    const opener = screen.getByTestId<HTMLButtonElement>('opener');
    opener.focus();
    show({ description: 'One' });
    fireEvent.keyDown(document, { key: 'F8' });
    opener.disabled = true;
    act(() => api.dismiss());
    expect(opener).not.toHaveFocus();
    expect(screen.getByText('Other')).not.toHaveFocus();
    // Unmounted opener.
    opener.disabled = false;
    show({ description: 'Two' });
    fireEvent.keyDown(document, { key: 'F8' });
    expect(polite().firstElementChild).toHaveFocus();
    rerender(
      <ToastProvider>
        <Capture />
        <button key="other" type="button">
          Other
        </button>
      </ToastProvider>,
    );
    act(() => api.dismiss());
    expect(screen.getByText('Other')).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });
});

describe('duration', () => {
  it('closes a toast without action after 5000 ms, calling onDismiss("timeout") once', () => {
    const onDismiss = vi.fn();
    setup();
    show({ description: 'Saved', onDismiss });
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(polite()).toHaveTextContent('Saved');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(polite()).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('timeout');
  });

  it('duration: null stays until closed', () => {
    setup();
    show({ description: 'Saved', duration: null });
    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    expect(polite()).toHaveTextContent('Saved');
  });

  it('a toast with an action and no duration is persistent', () => {
    setup();
    show({ description: 'Deleted', action: { label: 'Undo', onClick: () => undefined } });
    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    expect(polite()).toHaveTextContent('Deleted');
  });

  it('an explicit numeric duration with an action is honoured but warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setup();
    show({ description: 'Deleted', duration: 2000, action: { label: 'Undo', onClick: () => undefined } });
    expect(warn).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(polite()).toBeEmptyDOMElement();
  });

  it('the provider defaultDuration applies to a toast without an action', () => {
    setup({ defaultDuration: 1000 });
    show({ description: 'Saved' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(polite()).toBeEmptyDOMElement();
  });
});

describe('replacement and update', () => {
  it('a second show replaces the first: onDismiss("replaced"), new text, timer from zero', () => {
    const first = vi.fn();
    setup();
    show({ description: 'One', onDismiss: first });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    show({ description: 'Two' });
    expect(first).toHaveBeenCalledExactlyOnceWith('replaced');
    expect(screen.queryByText('One')).toBeNull();
    expect(polite()).toHaveTextContent('Two');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(polite()).toHaveTextContent('Two');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(polite()).toBeEmptyDOMElement();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('two shows in the same tick leave one toast: the last', () => {
    setup();
    act(() => {
      api.show({ description: 'One' });
      api.show({ description: 'Two' });
    });
    expect(screen.queryByText('One')).toBeNull();
    expect(polite().querySelectorAll('[data-state]')).toHaveLength(1);
    expect(polite()).toHaveTextContent('Two');
  });

  it('show with the id of the visible toast updates it in place and restarts the timer', () => {
    const onDismiss = vi.fn();
    setup();
    show({ id: 'save', description: 'Saving', duration: 3000, onDismiss });
    const node = polite().firstElementChild;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    show({ id: 'save', description: 'Saved', duration: 3000, onDismiss });
    expect(polite().firstElementChild).toBe(node);
    expect(polite()).toHaveTextContent('Saved');
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(polite()).toHaveTextContent('Saved');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(polite()).toBeEmptyDOMElement();
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('timeout');
  });

  it('show returns the given id, or a generated one', () => {
    setup();
    expect(show({ id: 'mine', description: 'x' })).toBe('mine');
    const generated = show({ description: 'y' });
    expect(generated).toMatch(/\S/);
    expect(generated).not.toBe('mine');
  });
});

describe('closing', () => {
  it('the close button is named after the title; two titles, two names; no title, no suffix', () => {
    setup();
    show({ title: 'Invoice', description: 'Saved' });
    expect(screen.getByRole('button', { name: 'Dismiss notification: Invoice' })).toBeInTheDocument();
    show({ title: 'Supplier', description: 'Saved' });
    expect(screen.getByRole('button', { name: 'Dismiss notification: Supplier' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss notification: Invoice' })).toBeNull();
    show({ description: 'No title' });
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument();
  });

  it('the close label is configurable', () => {
    setup({ labels: { dismiss: 'Chiudi notifica' } });
    show({ title: 'Fattura', description: 'Salvata' });
    expect(screen.getByRole('button', { name: 'Chiudi notifica: Fattura' })).toBeInTheDocument();
  });

  it('clicking the close button closes the toast with reason "user"', () => {
    const onDismiss = vi.fn();
    setup();
    show({ description: 'Saved', onDismiss });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(polite()).toBeEmptyDOMElement();
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('user');
  });

  it('the action calls its onClick and closes the toast', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    setup();
    show({ description: 'Deleted', action: { label: 'Undo', onClick }, onDismiss });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('user');
    expect(polite()).toBeEmptyDOMElement();
  });

  it('dismiss() closes the visible toast, dismiss(id) that one; an unknown id is a no-op', () => {
    const onDismiss = vi.fn();
    setup();
    const id = show({ id: 'a', description: 'One', onDismiss });
    expect(() => act(() => api.dismiss('nope'))).not.toThrow();
    expect(polite()).toHaveTextContent('One');
    act(() => api.dismiss(id));
    expect(polite()).toBeEmptyDOMElement();
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('programmatic');
    expect(() => act(() => api.dismiss())).not.toThrow();
  });

  it('an empty or whitespace description shows nothing and logs an error in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setup();
    show({ description: '   ' });
    show({ description: null });
    expect(polite()).toBeEmptyDOMElement();
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('unmounting the provider with a toast and a timer running updates nothing and throws nothing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onDismiss = vi.fn();
    const { unmount } = setup();
    show({ description: 'Saved', onDismiss });
    unmount();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(error).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(document.body.querySelector('[aria-live]')).toBeNull();
  });
});

describe('API and DOM', () => {
  it('useToast outside a provider throws naming the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Capture />)).toThrow(/ToastProvider/);
  });

  it('with nested providers the nearest one is used', () => {
    function Inner() {
      api = useToast();
      return null;
    }
    render(
      <ToastProvider>
        <ToastProvider>
          <Inner />
        </ToastProvider>
      </ToastProvider>,
    );
    const regions = screen.getAllByRole('status');
    expect(regions).toHaveLength(2);
    act(() => {
      api.show({ description: 'Inner' });
    });
    // Portals render in mount order: the inner provider mounts its viewport first.
    expect(regions.filter((r) => r.textContent?.includes('Inner'))).toHaveLength(1);
  });

  it('show and dismiss keep their identity between renders', () => {
    const seen: UseToastReturn[] = [];
    function Probe() {
      seen.push(useToast());
      return null;
    }
    const { rerender } = render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    expect(new Set(seen.map((s) => s.show)).size).toBe(1);
    expect(new Set(seen.map((s) => s.dismiss)).size).toBe(1);
  });

  it('merges className over the defaults, forwards HTML props to the viewport and leaks no provider prop', () => {
    const ref = createRef<HTMLDivElement>();
    setup({
      ref,
      className: 'sm:w-64 custom',
      'data-testid': 'viewport',
      labels: { dismiss: 'x' },
      hotkey: 'F9',
      defaultDuration: 10,
    } as ToastProviderProps);
    const viewport = screen.getByTestId('viewport');
    expect(ref.current).toBe(viewport);
    expect(viewport).toHaveClass('custom', 'z-rop-toast', 'sm:w-64');
    expect(viewport).not.toHaveClass('sm:w-96');
    for (const name of ['labels', 'hotkey', 'defaultDuration', 'defaultduration']) {
      expect(viewport.hasAttribute(name)).toBe(false);
    }
    show({ description: 'Saved' });
    expect(document.body.innerHTML).not.toMatch(/(hotkey|defaultDuration|defaultduration|labels)=/);
  });

  it('the live regions live inside the viewport, which is the one element with pointer-events none', () => {
    setup();
    const viewport = polite().parentElement as HTMLElement;
    expect(viewport).toHaveClass('pointer-events-none');
    show({ description: 'Saved' });
    expect(polite().firstElementChild).toHaveClass('pointer-events-auto');
  });
});
