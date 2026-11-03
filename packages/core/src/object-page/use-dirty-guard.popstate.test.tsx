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
    window.addEventListener('popstate', seen);
    render(<Host when />);
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

  it('removes its listener when when turns false and on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender, unmount } = render(<Host when />);
    rerender(<Host when={false} />);
    unmount();
    expect(remove.mock.calls.filter((c) => c[0] === 'popstate')).toHaveLength(1);
  });
});
