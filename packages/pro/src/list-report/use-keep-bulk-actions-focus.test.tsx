import { Profiler, useRef, useState, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListReportTable, Tooltip, TruncatedText, useListReport, type ListReportSelection } from '@formrail/core';
import { ListReportFrame } from '@formrail/core/internal';
import { isShown, useKeepBulkActionsFocus } from './use-keep-bulk-actions-focus';

// #571: the focus rule of the selection bar, moved from the core's `ListReportFrame` (#504, `keepBulkActionsFocus`)
// to the Pro. The tests of #504 moved with it (same titles and assertions; only the host changed: the frame with
// its internal `bulkActionsSlotRef` and this hook, instead of the removed internal prop). jsdom has no layout and no
// ResizeObserver: the observer records its callbacks, and what is "laid out" is what `checkVisibility` says, stubbed
// per test. The MutationObserver is jsdom's own (a real DOM): it reports attributes and children for real; it is only
// subclassed to record what each instance observes until it is disconnected.

const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
const mutationObservers: { targets: Node[] }[] = [];
const OriginalResizeObserver = globalThis.ResizeObserver;
const OriginalMutationObserver = globalThis.MutationObserver;
const actEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
  globalThis.MutationObserver = class extends OriginalMutationObserver {
    private entry = { targets: [] as Node[] };
    constructor(callback: MutationCallback) {
      super(callback);
      mutationObservers.push(this.entry);
    }
    override observe(target: Node, options?: MutationObserverInit) {
      this.entry.targets.push(target);
      super.observe(target, options);
    }
    override disconnect() {
      this.entry.targets.length = 0;
      super.disconnect();
    }
  };
  globalThis.ResizeObserver = class {
    private entry: { callback: ResizeObserverCallback; targets: Element[] };
    constructor(callback: ResizeObserverCallback) {
      this.entry = { callback, targets: [] };
      observers.push(this.entry);
    }
    observe(target: Element) {
      this.entry.targets.push(target);
    }
    unobserve() {}
    disconnect() {
      this.entry.targets.length = 0;
    }
  } as unknown as typeof ResizeObserver;
});
afterAll(() => {
  globalThis.ResizeObserver = OriginalResizeObserver;
  globalThis.MutationObserver = OriginalMutationObserver;
});

afterEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
  cleanup();
  vi.restoreAllMocks();
  observers.length = 0;
  mutationObservers.length = 0;
  document.head.querySelectorAll('style[data-test]').forEach((s) => s.remove());
});

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Bravo' },
  { id: 'c', name: 'Charlie' },
];

/** The frame of the core with the Pro hook on its slot, around the Free table (as `VirtualListReport` does). */
function Host({ bulkActions, rows = ROWS }: { bulkActions?: (selection: ListReportSelection<Row>) => ReactNode; rows?: Row[] }) {
  const table = useListReport<Row>({ rows, columns: [{ id: 'name', header: 'Name', accessor: (r) => r.name }], getRowId: (r) => r.id, selectable: true });
  const scroller = useRef<HTMLDivElement | null>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  useKeepBulkActionsFocus(slot, scroller);
  return (
    <ListReportFrame
      title="Items"
      table={table}
      bulkActions={bulkActions}
      bulkActionsWideOnly
      bulkActionsSlotRef={setSlot}
      // No `scrollerRef` is given to the frame (`tableProps.ref` is undefined): the table's container is `scroller`.
      renderTable={(tableProps) => <ListReportTable {...tableProps} ref={scroller} />}
    />
  );
}

const approve = () => <button type="button">Approve</button>;
const slotOf = (button: HTMLElement): HTMLElement => button.parentElement!;
const allBox = (): HTMLElement => screen.getByRole('checkbox', { name: 'Select all results' });

// "Laid out" = what `checkVisibility` says (jsdom: nothing is, unless stubbed).
function setLaidOut(laidOut: (el: Element) => boolean) {
  Element.prototype.checkVisibility ??= () => false;
  vi.spyOn(Element.prototype, 'checkVisibility').mockImplementation(function (this: Element) {
    return laidOut(this);
  });
}
/** Laid out unless detached, under `hidden`, under the test class `rop-test-gone` or under an inline `display: none`. */
const laidOutUnlessHidden = (el: Element) => el.isConnected && !el.closest('[hidden], .rop-test-gone, [style*="display: none"]');
const observerOf = (el: Element) => observers.find((o) => o.targets.includes(el));
/** The MutationObserver still observing `el`, if any. */
const mutationObserverOf = (el: Node) => mutationObservers.find((o) => o.targets.includes(el));
/** React's real scheduling (a render is a microtask), as in a browser: no `act` around what follows. */
const realScheduling = () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
};
/** Every microtask and a task: React's render, the observers' callbacks, the `focusout` read. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const fire = (el: Element) => act(() => observerOf(el)!.callback([], {} as ResizeObserver));
const addStyle = (css: string) => {
  const style = document.createElement('style');
  style.setAttribute('data-test', '');
  style.textContent = css;
  document.head.append(style);
};

describe('keepBulkActionsFocus: a focused action hidden or removed hands the focus to the header checkbox', () => {
  it('the slot is hidden (below 640px) while an action has the focus: the focus goes to the header checkbox', () => {
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const slot = slotOf(button);
    setLaidOut(() => true);
    // No observer while nothing of the slot has the focus.
    expect(observerOf(slot)).toBeUndefined();
    act(() => button.focus());
    expect(observerOf(slot)).toBeDefined();
    // The viewport crosses 640px: the slot is under `display: none`, the browser drops the focus.
    setLaidOut((el) => !slot.contains(el));
    act(() => button.blur());
    expect(document.activeElement).toBe(document.body);
    fire(slot);
    expect(allBox()).toHaveFocus();
    // Done: the observer is gone with the focus.
    expect(observerOf(slot)).toBeUndefined();
  });

  it('#571: the browser drops the focus of the hidden slot, then microtasks run, then the resize is observed: still handed over', async () => {
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const slot = slotOf(button);
    setLaidOut(() => true);
    act(() => button.focus());
    setLaidOut((el) => !slot.contains(el));
    // The blur comes with the style recalculation, the ResizeObserver at the next frame: microtasks run in between.
    await act(async () => button.blur());
    expect(observerOf(slot)).toBeDefined();
    fire(slot);
    expect(allBox()).toHaveFocus();
  });

  it('also while the hidden button still holds the focus (the observer runs before the browser drops it)', () => {
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    setLaidOut(() => true);
    act(() => button.focus());
    setLaidOut((el) => !slotOf(button).contains(el));
    fire(slotOf(button));
    expect(allBox()).toHaveFocus();
  });

  it('an action removed with the focus (the consumer dropped it): the focus goes to the header checkbox', async () => {
    setLaidOut((el) => el.isConnected);
    const { rerender } = render(<Host bulkActions={approve} />);
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    // The slot stays (the Pro always passes its own action); the consumer's button goes away.
    rerender(<Host bulkActions={() => <span>Nothing</span>} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    // The change of the slot's children is seen by its MutationObserver (a microtask).
    await waitFor(() => expect(allBox()).toHaveFocus());
  });

  it('#571: a browser that blurs the control while removing it (still in the document at its focusout): the focus still goes to the header checkbox', async () => {
    setLaidOut((el) => el.isConnected);
    // As Chrome does: the focused node gets its focusout during the removal, before it leaves the document.
    const removeChild = Node.prototype.removeChild;
    vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function <T extends Node>(this: Node, child: T): T {
      if ((child as Node) === document.activeElement) child.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      return removeChild.call(this, child) as T;
    });
    const { rerender } = render(<Host bulkActions={approve} />);
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    rerender(<Host bulkActions={() => <span>Nothing</span>} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    await waitFor(() => expect(allBox()).toHaveFocus());
  });

  it('without results the header checkbox is disabled: the focus goes to the table container', () => {
    setLaidOut(() => true);
    render(<Host rows={[]} bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    setLaidOut((el) => !slotOf(button).contains(el));
    fire(slotOf(button));
    expect(allBox()).toBeDisabled();
    expect(screen.getByRole('table', { name: 'Items' }).parentElement).toHaveFocus();
  });

  it('a focus the user moved elsewhere first is left where it is', async () => {
    setLaidOut(() => true);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const search = screen.getByRole('searchbox');
    act(() => button.focus());
    expect(observerOf(slotOf(button))).toBeDefined();
    await userEvent.click(search);
    // Losing the focus with the button still laid out is the user moving on: no observer any more.
    expect(observerOf(slotOf(button))).toBeUndefined();
    setLaidOut((el) => !slotOf(button).contains(el));
    expect(search).toHaveFocus();
  });

  it('#571: the action leaves the layout and the browser drops its focus, then the user moves the focus elsewhere: nothing tracked, the focus is left there', async () => {
    setLaidOut(() => true);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const search = screen.getByRole('searchbox');
    act(() => button.focus());
    // The slot leaves the layout (a media query: no mutation), the browser drops the focus to body with the action not
    // shown: still tracked, for the resize to come.
    setLaidOut((el) => !slotOf(button).contains(el));
    await act(async () => button.blur());
    expect(observerOf(slotOf(button))).toBeDefined();
    // The user puts the focus in the search field first: a focus that lands elsewhere is moved there on purpose.
    act(() => search.focus());
    await act(async () => {});
    expect(observerOf(slotOf(button))).toBeUndefined();
    expect(mutationObserverOf(slotOf(button))).toBeUndefined();
    expect(search).toHaveFocus();
  });

  it('#571: the action hidden and the focus moved elsewhere in the same task (the observer runs before React re-renders): the focus is not stolen', async () => {
    setLaidOut((el) => el.isConnected);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const search = screen.getByRole('searchbox');
    act(() => button.focus());
    expect(mutationObserverOf(slotOf(button))).toBeDefined();
    // As a handler of the consumer would: it hides the action, then focuses the search field. The mutation is
    // reported in a microtask queued before React's render (the one that stops tracking the action).
    realScheduling();
    button.style.visibility = 'hidden';
    search.focus();
    await settle();
    expect(search).toHaveFocus();
    expect(mutationObserverOf(slotOf(button))).toBeUndefined();
  });

  for (const [what, hide] of [
    ['hidden', { hidden: true }],
    ['removed', null],
  ] as const) {
    it(`#571: Tab from one control of the slot to the next, then the second one ${what}: the focus goes to the header checkbox`, async () => {
      setLaidOut(laidOutUnlessHidden);
      const two = (second: { hidden?: boolean } | null) => () => (
        <>
          <button type="button">Approve</button>
          {second && (
            <button type="button" {...second}>
              Export
            </button>
          )}
        </>
      );
      const { rerender } = render(<Host bulkActions={two({})} />);
      const user = userEvent.setup();
      act(() => screen.getByRole('button', { name: 'Approve' }).focus());
      await user.tab();
      expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
      // The `focusout` of the first control is read after the `focusin` of the second: the second stays tracked.
      await act(async () => {});
      rerender(<Host bulkActions={two(hide)} />);
      await waitFor(() => expect(allBox()).toHaveFocus());
    });
  }

  it('a resize of the slot while its action is still laid out moves nothing', () => {
    setLaidOut(() => true);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    fire(slotOf(button));
    expect(button).toHaveFocus();
  });

  it('#571: the focused control alone leaves the layout (a media query on it: no mutation, the slot keeps its box): its own box is observed', () => {
    setLaidOut(() => true);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    setLaidOut((el) => el !== button);
    fire(button);
    expect(allBox()).toHaveFocus();
  });

  it('an environment without layout (nothing laid out at focus time) never moves the focus', () => {
    setLaidOut(() => false);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    fire(slotOf(button));
    expect(button).toHaveFocus();
  });
});

// #571, point 2: the MutationObserver sees the whole subtree of the slot (children and `hidden`/`class`/`style`).
describe('a nested control of the slot (a grandchild, inside a wrapper of the consumer)', () => {
  const nested = (wrapper: { hidden?: boolean; className?: string; style?: React.CSSProperties; withButton?: boolean } = {}) =>
    function NestedActions() {
      const { withButton = true, ...props } = wrapper;
      return <div data-testid="wrapper" {...props}>{withButton ? <button type="button">Approve</button> : <span>Nothing</span>}</div>;
    };

  for (const [what, change] of [
    ['hidden', { hidden: true }],
    ['class', { className: 'rop-test-gone' }],
    ['style', { style: { display: 'none' } }],
  ] as const) {
    it(`its wrapper inside the slot changes \`${what}\` and hides it: the focus is recovered as for a direct child`, async () => {
      setLaidOut(laidOutUnlessHidden);
      const { rerender } = render(<Host bulkActions={nested()} />);
      const button = screen.getByRole('button', { name: 'Approve' });
      expect(button.parentElement).toBe(screen.getByTestId('wrapper'));
      act(() => button.focus());
      rerender(<Host bulkActions={nested(change)} />);
      // Only an attribute of the wrapper changed: no child of the slot was added or removed, no box was observed.
      expect(screen.getByTestId('wrapper').parentElement!.children).toHaveLength(1);
      await waitFor(() => expect(allBox()).toHaveFocus());
    });
  }

  it('the control is removed from inside its wrapper (the wrapper stays): the focus goes to the header checkbox', async () => {
    setLaidOut(laidOutUnlessHidden);
    const { rerender } = render(<Host bulkActions={nested()} />);
    const wrapper = screen.getByTestId('wrapper');
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    rerender(<Host bulkActions={nested({ withButton: false })} />);
    expect(screen.getByTestId('wrapper')).toBe(wrapper);
    await waitFor(() => expect(allBox()).toHaveFocus());
  });

  it('an attribute changed inside the slot that leaves the control shown moves nothing', async () => {
    setLaidOut(laidOutUnlessHidden);
    const { rerender } = render(<Host bulkActions={nested()} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    rerender(<Host bulkActions={nested({ className: 'rop-test-other' })} />);
    await act(async () => {});
    expect(button).toHaveFocus();
  });
});

// #571, point 3: `visibility: hidden` (not seen by `checkVisibility()` without options, nor by a resize).
describe('a focused control under visibility: hidden', () => {
  it('inline style on the control (the Pro action once the selection stops being partial): the focus is recovered', async () => {
    setLaidOut((el) => el.isConnected);
    const action = (hidden: boolean) => () => <button type="button" style={hidden ? { visibility: 'hidden' } : undefined}>Approve</button>;
    const { rerender } = render(<Host bulkActions={action(false)} />);
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    rerender(<Host bulkActions={action(true)} />);
    await waitFor(() => expect(allBox()).toHaveFocus());
  });

  it('a class on a wrapper inside the slot (a stylesheet rule): the focus is recovered', async () => {
    setLaidOut((el) => el.isConnected);
    addStyle('.rop-test-unseen { visibility: hidden; }');
    const action = (hidden: boolean) => () => (
      <div className={hidden ? 'rop-test-unseen' : undefined}>
        <button type="button">Approve</button>
      </div>
    );
    const { rerender } = render(<Host bulkActions={action(false)} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    rerender(<Host bulkActions={action(true)} />);
    expect(getComputedStyle(button).visibility).toBe('hidden');
    await waitFor(() => expect(allBox()).toHaveFocus());
  });

  it('`visibility: visible` on the control inside a hidden wrapper: the control is shown, the focus stays', async () => {
    setLaidOut((el) => el.isConnected);
    const action = (hidden: boolean) => () => (
      <div style={hidden ? { visibility: 'hidden' } : undefined}>
        <button type="button" style={{ visibility: 'visible' }}>Approve</button>
      </div>
    );
    const { rerender } = render(<Host bulkActions={action(false)} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    rerender(<Host bulkActions={action(true)} />);
    await act(async () => {});
    expect(button).toHaveFocus();
  });

  it('a blur while the control is under visibility: hidden keeps it tracked (the browser dropped the focus first)', async () => {
    setLaidOut((el) => el.isConnected);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    // The browser hides the control and drops its focus before the observer runs: the blur keeps the subscription.
    act(() => {
      button.style.visibility = 'hidden';
      button.blur();
    });
    expect(document.activeElement).toBe(document.body);
    await waitFor(() => expect(allBox()).toHaveFocus());
  });
});

describe('edge cases', () => {
  it('#571: the slot goes away while a control has the focus, then a new one comes: no observer at rest on it', () => {
    setLaidOut((el) => el.isConnected);
    const { rerender } = render(<Host bulkActions={approve} />);
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    expect(mutationObserverOf(slotOf(screen.getByRole('button', { name: 'Approve' })))).toBeDefined();
    // Without bulkActions the frame renders no slot: the focused control goes with it, nothing is tracked any more.
    rerender(<Host />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    rerender(<Host bulkActions={approve} />);
    const slot = slotOf(screen.getByRole('button', { name: 'Approve' }));
    expect(observerOf(slot)).toBeUndefined();
    expect(mutationObserverOf(slot)).toBeUndefined();
  });

  it('an empty slot (bulkActions returns null) or one without a focused control: no observer at rest', () => {
    setLaidOut(() => true);
    const { rerender } = render(<Host bulkActions={() => null} />);
    // The slot is the only `<div>` child of the bar (the count is a `<span>`, then "Clear selection").
    const slot = () => Array.from(screen.getByRole('group', { name: /Selection/ }).children).find((c) => c.tagName === 'DIV')!;
    expect(slot()).toBeEmptyDOMElement();
    const onSlot = () => observers.filter((o) => o.targets.some((t) => slot().contains(t)));
    expect(onSlot()).toEqual([]);
    rerender(<Host bulkActions={approve} />);
    expect(onSlot()).toEqual([]);
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    expect(onSlot()).toHaveLength(1);
  });

  it('bulkActions changed during the selection, the focused control still there: the focus stays', async () => {
    setLaidOut((el) => el.isConnected);
    const { rerender } = render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    rerender(
      <Host
        bulkActions={() => (
          <>
            {approve()}
            <button type="button">Export</button>
          </>
        )}
      />,
    );
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Approve' })).toBe(button);
    expect(button).toHaveFocus();
  });

  it('unmount while a control has the focus: observers disconnected and the native listeners removed', () => {
    setLaidOut(() => true);
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const added = vi.spyOn(document, 'addEventListener');
    const { unmount } = render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const slot = slotOf(button);
    const removed = vi.spyOn(slot, 'removeEventListener');
    const removedFromDocument = vi.spyOn(document, 'removeEventListener');
    act(() => button.focus());
    expect(observerOf(slot)).toBeDefined();
    const observer = observerOf(slot)!;
    const mutations = mutationObserverOf(slot)!;
    expect(mutations).toBeDefined();
    unmount();
    expect(observer.targets).toEqual([]);
    expect(disconnect).toHaveBeenCalled();
    // The hook's own MutationObserver (not just any: the core and jsdom have others).
    expect(mutations.targets).toEqual([]);
    expect(removed.mock.calls.map(([type]) => type)).toEqual(['focusout']);
    // The `focusin` listener is on the document (a focus that lands outside the slot untracks): the same one, removed.
    const onFocusIn = added.mock.calls.filter(([type]) => type === 'focusin').at(-1)![1];
    expect(removedFromDocument.mock.calls.filter(([type]) => type === 'focusin').map(([, listener]) => listener)).toContain(onFocusIn);
  });

  it('#571: after the focus is handed over, the user puts it on body: a later change of the slot leaves it there', async () => {
    setLaidOut((el) => el.isConnected);
    const { rerender } = render(<Host bulkActions={approve} />);
    const slot = slotOf(screen.getByRole('button', { name: 'Approve' }));
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    rerender(<Host bulkActions={() => <span>Nothing</span>} />);
    await waitFor(() => expect(allBox()).toHaveFocus());
    expect(mutationObserverOf(slot)).toBeUndefined();
    // A click on a blank area: the focus is on body. Then the slot changes (children, class, style).
    act(() => allBox().blur());
    expect(document.activeElement).toBe(document.body);
    rerender(<Host bulkActions={approve} />);
    slot.classList.add('rop-test-changed');
    slot.style.outline = '1px solid';
    await act(async () => {});
    expect(document.activeElement).toBe(document.body);
  });

  it('after the focus is handed over, a later change of the slot moves nothing (no observer left)', async () => {
    setLaidOut((el) => el.isConnected);
    const { rerender } = render(<Host bulkActions={approve} />);
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    rerender(<Host bulkActions={() => <span>Nothing</span>} />);
    await waitFor(() => expect(allBox()).toHaveFocus());
    const search = screen.getByRole('searchbox');
    act(() => search.focus());
    rerender(<Host bulkActions={approve} />);
    await act(async () => {});
    expect(search).toHaveFocus();
  });
});

// #571, review notes: the focus is read in the slot's root, not in the global document: its own document (an iframe's)
// or its shadow root (where the target of a `focusin` is the control, not the host), then that root's document.
describe('#571: the frame in another document or in a shadow root', () => {
  const hiddenApprove = () => (
    <button type="button" hidden>
      Approve
    </button>
  );
  /** A shadow root in the document, with a container for React inside it. */
  const inShadowRoot = (mode: ShadowRootMode) => {
    const host = document.body.appendChild(document.createElement('div'));
    const root = host.attachShadow({ mode });
    return { host, root, container: root.appendChild(document.createElement('div')) };
  };

  for (const mode of ['open', 'closed'] as const) {
    it(`inside a ${mode} shadow root: tracked, a hidden focused control hands the focus to the header checkbox`, async () => {
      setLaidOut(laidOutUnlessHidden);
      const { host, root, container } = inShadowRoot(mode);
      const { rerender } = render(<Host bulkActions={approve} />, { container });
      const button = within(container).getByRole('button', { name: 'Approve' });
      const slot = slotOf(button);
      act(() => button.focus());
      expect(root.activeElement).toBe(button);
      // The document only sees the host: the `focusin` is read on the shadow root, where its target is the control.
      expect(document.activeElement).toBe(host);
      expect(mutationObserverOf(slot)).toBeDefined();
      // Hidden while it still holds the focus (the observer runs before the browser drops it): read in the root.
      rerender(<Host bulkActions={hiddenApprove} />);
      const header = within(container).getByRole('checkbox', { name: 'Select all results' });
      await waitFor(() => expect(root.activeElement).toBe(header));
      expect(mutationObserverOf(slot)).toBeUndefined();
      host.remove();
    });

    it(`inside a ${mode} shadow root: the control leaves the layout and the browser drops its focus to body, then a change: the focus goes to the header checkbox`, async () => {
      setLaidOut(laidOutUnlessHidden);
      const { host, root, container } = inShadowRoot(mode);
      const { rerender } = render(<Host bulkActions={approve} />, { container });
      const button = within(container).getByRole('button', { name: 'Approve' });
      act(() => button.focus());
      // A media query on the control (no mutation): the browser drops its focus, still tracked.
      setLaidOut((el) => el !== button && laidOutUnlessHidden(el));
      await act(async () => button.blur());
      // The root has no active element then: its document's one is read (body).
      expect(root.activeElement).toBeNull();
      expect(document.activeElement).toBe(document.body);
      rerender(<Host bulkActions={hiddenApprove} />);
      await waitFor(() => expect(root.activeElement).toBe(within(container).getByRole('checkbox', { name: 'Select all results' })));
      host.remove();
    });

    it(`inside a ${mode} shadow root: the control hidden and the focus moved to the document outside the root in the same task, the focus is not stolen`, async () => {
      setLaidOut((el) => el.isConnected);
      const outside = document.body.appendChild(document.createElement('input'));
      const { host, root, container } = inShadowRoot(mode);
      render(<Host bulkActions={approve} />, { container });
      const button = within(container).getByRole('button', { name: 'Approve' });
      act(() => button.focus());
      expect(mutationObserverOf(slotOf(button))).toBeDefined();
      realScheduling();
      button.style.visibility = 'hidden';
      outside.focus();
      await settle();
      // The root has no active element then: its document's one is read (the input, not body).
      expect(root.activeElement).toBeNull();
      expect(outside).toHaveFocus();
      // The change ended the tracking (React re-renders in a later task: no event there).
      await waitFor(() => expect(mutationObserverOf(slotOf(button))).toBeUndefined());
      expect(outside).toHaveFocus();
      host.remove();
      outside.remove();
    });
  }

  for (const dropped of [false, true]) {
    it(`in another document (an iframe): tracked there, a hidden focused control hands the focus to the header checkbox${dropped ? ' (dropped to the body of that document first)' : ''}`, async () => {
      const iframe = document.body.appendChild(document.createElement('iframe'));
      const frameWindow = iframe.contentWindow as unknown as typeof globalThis;
      const doc = iframe.contentDocument!;
      // The iframe has its own `Element`: laid out = in the document and not under `hidden`, as above.
      frameWindow.Element.prototype.checkVisibility = function (this: Element) {
        return laidOutUnlessHidden(this);
      };
      const container = doc.body.appendChild(doc.createElement('div'));
      const { rerender } = render(<Host bulkActions={approve} />, { container });
      const button = within(container).getByRole('button', { name: 'Approve' });
      act(() => button.focus());
      expect(doc.activeElement).toBe(button);
      expect(mutationObserverOf(slotOf(button))).toBeDefined();
      if (dropped) {
        // The control leaves the layout (no mutation) and the browser drops its focus to the body of that document
        // (not the global one): still tracked; then a change of the slot is seen.
        frameWindow.Element.prototype.checkVisibility = function (this: Element) {
          return this !== button && laidOutUnlessHidden(this);
        };
        await act(async () => button.blur());
        expect(doc.activeElement).toBe(doc.body);
      }
      rerender(<Host bulkActions={hiddenApprove} />);
      await waitFor(() => expect(doc.activeElement).toBe(within(container).getByRole('checkbox', { name: 'Select all results' })));
      iframe.remove();
    });
  }
});

describe('isShown: laid out and not under visibility: hidden', () => {
  const make = (html: string) => {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.append(root);
    return root;
  };
  afterEach(() => document.body.replaceChildren());

  it('is isLaidOut of the core plus the computed visibility', () => {
    setLaidOut((el) => !el.closest('[hidden]'));
    const root = make(
      '<button id="a">a</button><button id="b" style="visibility: hidden">b</button><button id="c" style="visibility: collapse">c</button><div hidden><button id="d">d</button></div>',
    );
    const by = (id: string) => root.querySelector(`#${id}`)!;
    expect([isShown(by('a')), isShown(by('b')), isShown(by('c')), isShown(by('d'))]).toEqual([true, false, false, false]);
  });

  it('a descendant with visibility: visible of a hidden node is shown (the computed value is inherited, then overridden)', () => {
    setLaidOut(() => true);
    const root = make('<div style="visibility: hidden"><button id="in">in</button><button id="over" style="visibility: visible">over</button></div>');
    expect(isShown(root.querySelector('#in')!)).toBe(false);
    expect(isShown(root.querySelector('#over')!)).toBe(true);
  });
});

// #582: follow-ups of the review of #571 (PR #577).
describe('#582: a control not shown when its tracking starts never leaves an observer at rest', () => {
  it('hidden as it takes the focus, its focus dropped to body before its tracking starts: no observer, a later change moves nothing', async () => {
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const slot = slotOf(button);
    setLaidOut(() => true);
    act(() => {
      button.focus();
      // In the same task: the slot leaves the layout (a media query: no mutation) and the browser drops the focus.
      setLaidOut((el) => !slot.contains(el));
      button.blur();
    });
    await act(async () => {});
    expect(observerOf(slot)).toBeUndefined();
    expect(mutationObserverOf(slot)).toBeUndefined();
    slot.classList.add('rop-test-changed');
    await act(async () => {});
    expect(document.activeElement).toBe(document.body);
  });

  it('an environment without layout, the control holding the focus: the first change seen ends its tracking (observers disconnected), the focus stays', async () => {
    setLaidOut(() => false);
    const { rerender } = render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const slot = slotOf(button);
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    act(() => button.focus());
    const resize = observerOf(slot)!;
    const mutations = mutationObserverOf(slot)!;
    expect(resize).toBeDefined();
    expect(mutations).toBeDefined();
    disconnect.mockClear();
    // A change of the slot's children (an action added), the focused control untouched.
    rerender(
      <Host
        bulkActions={() => (
          <>
            {approve()}
            <button type="button">Export</button>
          </>
        )}
      />,
    );
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Approve' })).toBe(button);
    expect(disconnect).toHaveBeenCalled();
    expect(resize.targets).toEqual([]);
    expect(mutations.targets).toEqual([]);
    expect(button).toHaveFocus();
  });

  it('an environment without layout, then the focus dropped to body: untracked at once, no observer until the next focus', async () => {
    setLaidOut(() => false);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const slot = slotOf(button);
    act(() => button.focus());
    expect(mutationObserverOf(slot)).toBeDefined();
    await act(async () => button.blur());
    expect(observerOf(slot)).toBeUndefined();
    expect(mutationObserverOf(slot)).toBeUndefined();
    act(() => button.focus());
    expect(mutationObserverOf(slot)).toBeDefined();
  });
});

/** jsdom has no layout: the widths `TruncatedText` reads to know whether it overflows. */
function setWidths(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
}

describe('#582: an action inside a Tooltip keeps its tracking when the tooltip closes', () => {
  it('a TruncatedText action whose tooltip closes by force (its text fits again: a synthetic focusout, the focus stays): still tracked; hidden then, the focus goes to the header checkbox', async () => {
    setLaidOut(laidOutUnlessHidden);
    const actions = (text: string, hidden = false) =>
      function Actions() {
        return (
          <>
            <button type="button">Before</button>
            <TruncatedText tabIndex={0} data-testid="truncated" hidden={hidden}>
              {text}
            </TruncatedText>
          </>
        );
      };
    const { rerender } = render(<Host bulkActions={actions('Approve every selected invoice of this supplier')} />);
    const truncated = screen.getByTestId('truncated');
    const slot = slotOf(truncated);
    setWidths(truncated, 500, 100);
    const user = userEvent.setup();
    act(() => screen.getByRole('button', { name: 'Before' }).focus());
    await user.tab();
    expect(truncated).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    const focusouts = vi.fn();
    truncated.addEventListener('focusout', focusouts);
    // The text fits again: the tooltip closes through the `focusout` it dispatches on its trigger.
    setWidths(truncated, 50, 100);
    rerender(<Host bulkActions={actions('Approve')} />);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(focusouts).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(truncated).toHaveFocus();
    expect(mutationObserverOf(slot)).toBeDefined();
    rerender(<Host bulkActions={actions('Approve', true)} />);
    await waitFor(() => expect(allBox()).toHaveFocus());
  });

  for (const how of ['Escape', 'the pointer leaving'] as const) {
    it(`a Tooltip around an action, opened with the mouse and closed by ${how}: the action keeps the focus and its tracking; hidden then, the focus goes to the header checkbox`, async () => {
      setLaidOut(laidOutUnlessHidden);
      const actions = (hidden = false) =>
        function Actions() {
          return (
            <Tooltip content="Approve the selected invoices" delayDuration={0}>
              <button type="button" hidden={hidden}>
                Approve
              </button>
            </Tooltip>
          );
        };
      const { rerender } = render(<Host bulkActions={actions()} />);
      const button = screen.getByRole('button', { name: 'Approve' });
      const user = userEvent.setup();
      act(() => button.focus());
      await user.hover(button);
      expect(await screen.findByRole('tooltip')).toBeInTheDocument();
      if (how === 'Escape') await user.keyboard('{Escape}');
      else {
        // Out of the grace area towards the (hoverable) tooltip too, as the Tooltip's own tests do.
        await user.unhover(button);
        await user.pointer({ target: document.body, coords: { clientX: 900, clientY: 900 } });
      }
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
      await act(async () => {});
      expect(button).toHaveFocus();
      expect(mutationObserverOf(slotOf(button))).toBeDefined();
      rerender(<Host bulkActions={actions(true)} />);
      await waitFor(() => expect(allBox()).toHaveFocus());
    });
  }

  it('a Tooltip around an action closed by a blur (Tab to the next action): the next action is tracked; hidden then, the focus goes to the header checkbox', async () => {
    setLaidOut(laidOutUnlessHidden);
    const actions = (hidden = false) =>
      function Actions() {
        return (
          <>
            <button type="button">Before</button>
            <Tooltip content="Approve the selected invoices">
              <button type="button">Approve</button>
            </Tooltip>
            <button type="button" hidden={hidden}>
              Export
            </button>
          </>
        );
      };
    const { rerender } = render(<Host bulkActions={actions()} />);
    const user = userEvent.setup();
    act(() => screen.getByRole('button', { name: 'Before' }).focus());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    await act(async () => {});
    rerender(<Host bulkActions={actions(true)} />);
    await waitFor(() => expect(allBox()).toHaveFocus());
  });

  it('a focusout that leaves the control the active element (another window took the focus): still tracked', async () => {
    setLaidOut(laidOutUnlessHidden);
    const { rerender } = render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    await act(async () => {
      button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(button).toHaveFocus();
    expect(mutationObserverOf(slotOf(button))).toBeDefined();
    rerender(<Host bulkActions={() => <span>Nothing</span>} />);
    await waitFor(() => expect(allBox()).toHaveFocus());
  });
});

describe('#582: the focusin listener of the root renders nothing for a focus outside the bar', () => {
  it('Tab and typing through 20 fields elsewhere: zero commits under a Profiler, at rest and after a control of the bar had the focus', async () => {
    setLaidOut(() => true);
    const commits: string[] = [];
    render(
      <>
        <Profiler id="bulk-actions" onRender={(_id, phase) => commits.push(phase)}>
          <Host bulkActions={approve} />
        </Profiler>
        <form aria-label="Elsewhere">
          {Array.from({ length: 20 }, (_, i) => (
            <input key={i} aria-label={`Field ${i + 1}`} />
          ))}
        </form>
      </>,
    );
    const user = userEvent.setup();
    const throughTheForm = async () => {
      act(() => screen.getByLabelText('Field 1').focus());
      for (let i = 1; i < 20; i++) {
        await user.keyboard('x');
        await user.tab();
      }
      expect(screen.getByLabelText('Field 20')).toHaveFocus();
    };
    commits.length = 0;
    await throughTheForm();
    expect(commits).toEqual([]);
    // A control of the bar takes the focus, then leaves it for the form: one commit each (tracked, then untracked).
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    act(() => screen.getByLabelText('Field 1').focus());
    await act(async () => {});
    expect(commits).toEqual(['update', 'update']);
    commits.length = 0;
    await throughTheForm();
    expect(commits).toEqual([]);
  });
});

describe('#582: slots in different roots, and a slot moved to another root', () => {
  const hiddenApprove = () => (
    <button type="button" hidden>
      Approve
    </button>
  );
  const shadowContainer = (mode: ShadowRootMode = 'open') => {
    const host = document.body.appendChild(document.createElement('div'));
    const root = host.attachShadow({ mode });
    return { host, root, container: root.appendChild(document.createElement('div')) };
  };

  it('two frames, one in the document and one in a shadow root: each tracks its own control; the focus moved from one to the other untracks the first', async () => {
    setLaidOut(laidOutUnlessHidden);
    const inDocument = document.body.appendChild(document.createElement('div'));
    const { host, root, container: inShadow } = shadowContainer();
    const first = render(<Host bulkActions={approve} />, { container: inDocument });
    const second = render(<Host bulkActions={approve} />, { container: inShadow });
    const buttonA = within(inDocument).getByRole('button', { name: 'Approve' });
    const buttonB = within(inShadow).getByRole('button', { name: 'Approve' });
    act(() => buttonA.focus());
    expect(mutationObserverOf(slotOf(buttonA))).toBeDefined();
    // The document hears the host (outside the first slot), the shadow root the control of the second slot.
    act(() => buttonB.focus());
    expect(mutationObserverOf(slotOf(buttonA))).toBeUndefined();
    expect(mutationObserverOf(slotOf(buttonB))).toBeDefined();
    second.rerender(<Host bulkActions={hiddenApprove} />);
    const headerB = within(inShadow).getByRole('checkbox', { name: 'Select all results' });
    await waitFor(() => expect(root.activeElement).toBe(headerB));
    // The first frame's action hidden afterwards: nothing tracked there, nothing moves.
    first.rerender(<Host bulkActions={hiddenApprove} />);
    await act(async () => {});
    expect(root.activeElement).toBe(headerB);
    expect(document.activeElement).toBe(host);
    host.remove();
    inDocument.remove();
  });

  it('the slot element moved to a shadow root without being replaced: not followed (its control is not tracked there, its focus is left as the browser leaves it); back in its root, tracked again', async () => {
    setLaidOut(laidOutUnlessHidden);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const slot = slotOf(button);
    const parent = slot.parentNode!;
    const next = slot.nextSibling;
    const { host, root } = shadowContainer();
    root.append(slot);
    act(() => button.focus());
    expect(root.activeElement).toBe(button);
    expect(observerOf(slot)).toBeUndefined();
    expect(mutationObserverOf(slot)).toBeUndefined();
    button.hidden = true;
    await act(async () => {});
    expect(allBox()).not.toHaveFocus();
    expect(root.activeElement).toBe(button);
    // Back in its root: the listener stayed on the document, the control is tracked again.
    button.hidden = false;
    act(() => button.blur());
    parent.insertBefore(slot, next);
    act(() => button.focus());
    expect(mutationObserverOf(slot)).toBeDefined();
    host.remove();
  });

  for (const mode of ['open', 'closed'] as const) {
    it(`inside a ${mode} shadow root: the focus moved to the document outside the root with the control shown (no focusin on the root): its focusout untracks it, a later change moves nothing`, async () => {
      setLaidOut(laidOutUnlessHidden);
      const outside = document.body.appendChild(document.createElement('input'));
      const { host, container } = shadowContainer(mode);
      const { rerender } = render(<Host bulkActions={approve} />, { container });
      const button = within(container).getByRole('button', { name: 'Approve' });
      const slot = slotOf(button);
      act(() => button.focus());
      expect(mutationObserverOf(slot)).toBeDefined();
      await act(async () => outside.focus());
      expect(observerOf(slot)).toBeUndefined();
      expect(mutationObserverOf(slot)).toBeUndefined();
      rerender(<Host bulkActions={() => <span>Nothing</span>} />);
      await act(async () => {});
      expect(outside).toHaveFocus();
      host.remove();
      outside.remove();
    });
  }
});

describe('#582: disabled or inert on the focused control (not handled, as the TSDoc says)', () => {
  const wrapped = (withButton = true) =>
    function Actions() {
      return <div data-testid="wrapper">{withButton ? <button type="button">Approve</button> : <span>Nothing</span>}</div>;
    };
  for (const [what, apply] of [
    ['`disabled` on the control', (button: HTMLButtonElement) => (button.disabled = true)],
    ['`inert` on the control', (button: HTMLButtonElement) => button.setAttribute('inert', '')],
    ['`inert` on a wrapper of the consumer inside the slot', (button: HTMLButtonElement) => button.parentElement!.setAttribute('inert', '')],
    ['`inert` on an ancestor of the bar, outside the slot', (button: HTMLButtonElement) => slotOf(button.parentElement!).parentElement!.setAttribute('inert', '')],
  ] as const) {
    it(`${what}, the browser drops its focus to body: untracked, the focus is left on body, removing the control then moves nothing`, async () => {
      setLaidOut(laidOutUnlessHidden);
      const { rerender } = render(<Host bulkActions={wrapped()} />);
      const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Approve' });
      const slot = slotOf(button.parentElement!);
      act(() => button.focus());
      expect(mutationObserverOf(slot)).toBeDefined();
      // The browser's blur, then the attribute (jsdom ignores `blur()` on a disabled control): the `focusout` is read
      // after both, in a microtask, as after a browser that drops the focus when the attribute is set.
      await act(async () => {
        button.blur();
        apply(button);
      });
      expect(observerOf(slot)).toBeUndefined();
      expect(mutationObserverOf(slot)).toBeUndefined();
      rerender(<Host bulkActions={wrapped(false)} />);
      await act(async () => {});
      expect(document.activeElement).toBe(document.body);
    });
  }

  it('`disabled` on the control, a browser that keeps the focus on it: still tracked as a shown control; removed then, the focus goes to the header checkbox', async () => {
    setLaidOut(laidOutUnlessHidden);
    const { rerender } = render(<Host bulkActions={wrapped()} />);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Approve' });
    act(() => button.focus());
    await act(async () => {
      button.disabled = true;
    });
    expect(button).toHaveFocus();
    expect(mutationObserverOf(slotOf(button.parentElement!))).toBeDefined();
    rerender(<Host bulkActions={wrapped(false)} />);
    await waitFor(() => expect(allBox()).toHaveFocus());
  });
});
