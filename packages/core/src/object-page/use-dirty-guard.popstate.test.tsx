import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDirtyGuard } from './use-dirty-guard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { navigation?: unknown }).navigation;
});

function Host({ when }: { when: boolean }) {
  const { dialog } = useDirtyGuard({ when });
  return dialog;
}

const popstate = () => act(() => void window.dispatchEvent(new PopStateEvent('popstate')));

describe('useDirtyGuard: popstate (Back/Forward)', () => {
  it('with when=false the popstate is untouched: no dialog, no history.go', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    const seen = vi.fn();
    window.addEventListener('popstate', seen);
    render(<Host when={false} />);
    popstate();
    window.removeEventListener('popstate', seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('with when=true it undoes the traversal, hides it from other listeners and opens the dialog', async () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    const push = vi.spyOn(window.history, 'pushState');
    const seen = vi.fn();
    render(<Host when />);
    // Registered AFTER the hook: the only listeners the fallback can hide the popstate from.
    window.addEventListener('popstate', seen);
    popstate();
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(go).toHaveBeenCalledExactlyOnceWith(1); // Back (fallback) undone by going forward
    expect(push).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
    // The popstate fired by the undo is swallowed too.
    popstate();
    expect(seen).not.toHaveBeenCalled();
    window.removeEventListener('popstate', seen);
  });

  it('"Keep editing" does nothing more; "Leave" repeats the traversal and lets its popstate through', async () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    const seen = vi.fn();
    window.addEventListener('popstate', seen);
    render(<Host when />);
    popstate();
    popstate(); // undo
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(go).toHaveBeenCalledTimes(1);

    popstate();
    popstate(); // undo
    await userEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    expect(go).toHaveBeenLastCalledWith(-1);
    popstate(); // the confirmed traversal
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', seen);
  });

  it('uses the Navigation API to tell Forward from Back', async () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    const listeners: Record<string, (e: Event) => void> = {};
    const nav = {
      currentEntry: { index: 3 },
      addEventListener: (t: string, l: (e: Event) => void) => void (listeners[t] = l),
      removeEventListener: vi.fn(),
    };
    (window as unknown as { navigation: unknown }).navigation = nav;
    render(<Host when />);
    nav.currentEntry = { index: 4 };
    listeners.currententrychange?.(Object.assign(new Event('currententrychange'), { from: { index: 3 } }));
    popstate();
    await screen.findByRole('dialog');
    expect(go).toHaveBeenCalledWith(-1); // Forward by one, undone by Back
  });

  it('a confirmed guard() action that navigates itself (history.back) is not intercepted again', async () => {
    const seen = vi.fn();
    window.addEventListener('popstate', seen);
    function Opener() {
      const { guard, dialog } = useDirtyGuard({ when: true });
      return (
        <>
          <button onClick={() => guard(() => void window.dispatchEvent(new PopStateEvent('popstate')))}>
            Back to list
          </button>
          {dialog}
        </>
      );
    }
    render(<Opener />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    window.removeEventListener('popstate', seen);
  });

  describe('Navigation API: the traversal is cancelled, no popstate fires', () => {
    function setup() {
      const listeners: Record<string, (e: Event) => void> = {};
      const nav = {
        currentEntry: { index: 3 },
        traverseTo: vi.fn(),
        addEventListener: (t: string, l: (e: Event) => void) => void (listeners[t] = l),
        removeEventListener: vi.fn(),
      };
      (window as unknown as { navigation: unknown }).navigation = nav;
      const navigate = (over: Record<string, unknown> = {}, cancelable = true) => {
        const event = Object.assign(new Event('navigate', { cancelable }), {
          navigationType: 'traverse',
          destination: { index: 2, key: 'k2', sameDocument: true },
          ...over,
        });
        act(() => void listeners.navigate?.(event));
        return event;
      };
      return { nav, navigate };
    }

    it('cancels a cancelable traverse, opens the dialog, and "Leave" traverses to that entry', async () => {
      const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
      const { nav, navigate } = setup();
      render(<Host when />);
      const event = navigate();
      expect(event.defaultPrevented).toBe(true);
      await userEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
      expect(nav.traverseTo).toHaveBeenCalledExactlyOnceWith('k2');
      expect(go).not.toHaveBeenCalled();
      // The confirmed traversal itself is let through.
      expect(navigate().defaultPrevented).toBe(false);
    });

    it('"Keep editing" leaves nothing pending: the next Back asks again', async () => {
      const { nav, navigate } = setup();
      render(<Host when />);
      navigate();
      await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(nav.traverseTo).not.toHaveBeenCalled();
      expect(navigate().defaultPrevented).toBe(true);
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('ignores pushes, reloads and non-cancelable traversals (those fall back to popstate)', () => {
      const { navigate } = setup();
      render(<Host when />);
      expect(navigate({ navigationType: 'push' }).defaultPrevented).toBe(false);
      expect(navigate({ navigationType: 'reload' }).defaultPrevented).toBe(false);
      expect(navigate({}, false).defaultPrevented).toBe(false);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('with two active hooks only the most recently activated one intercepts: one dialog, one traversal', async () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    function Two() {
      const page = useDirtyGuard({ when: true, labels: { title: 'Page' } });
      return (
        <>
          {page.dialog}
          <Sheet />
        </>
      );
    }
    function Sheet() {
      return <SheetInner />;
    }
    function SheetInner() {
      return useDirtyGuard({ when: true, labels: { title: 'Sheet' } }).dialog;
    }
    render(<Two />);
    popstate();
    // Effects run children first: the outer (page) hook is the last activated.
    expect(await screen.findByRole('dialog', { name: 'Page' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Sheet' })).toBeNull();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('a no-op undo does not leave the next Back swallowed without a dialog', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    render(<Host when />);
    popstate(); // undo never produces its popstate (nothing to go to)
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    act(() => void vi.advanceTimersByTime(600));
    popstate();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(go).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('removes its listener when when turns false and on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender, unmount } = render(<Host when />);
    rerender(<Host when={false} />);
    unmount();
    expect(remove.mock.calls.filter((c) => c[0] === 'popstate')).toHaveLength(1);
  });
});
