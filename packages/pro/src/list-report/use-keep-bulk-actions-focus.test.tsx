import { useRef, useState, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListReportTable, useListReport, type ListReportSelection } from '@formrail/core';
import { ListReportFrame } from '@formrail/core/internal';
import { isShown, useKeepBulkActionsFocus } from './use-keep-bulk-actions-focus';

// #571: the focus rule of the selection bar, moved from the core's `ListReportFrame` (#504, `keepBulkActionsFocus`)
// to the Pro. The tests of #504 moved with it (same titles and assertions; only the host changed: the frame with
// its internal `bulkActionsSlotRef` and this hook, instead of the removed internal prop). jsdom has no layout and no
// ResizeObserver: the observer records its callbacks, and what is "laid out" is what `checkVisibility` says, stubbed
// per test. The MutationObserver is jsdom's own (a real DOM): it reports attributes and children for real.

const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
const OriginalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  observers.length = 0;
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

  it('#571: the action leaves the layout, the user moves the focus elsewhere, then the observer runs: the focus is not stolen', async () => {
    setLaidOut(() => true);
    render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const search = screen.getByRole('searchbox');
    act(() => button.focus());
    // The slot leaves the layout (a media query: no mutation), the focus leaves it with the action not shown, so the
    // action stays tracked; the user puts the focus in the search field before the resize is observed.
    setLaidOut((el) => !slotOf(button).contains(el));
    act(() => search.focus());
    await act(async () => {});
    expect(observerOf(slotOf(button))).toBeDefined();
    fire(slotOf(button));
    expect(search).toHaveFocus();
  });

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
    const { unmount } = render(<Host bulkActions={approve} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const slot = slotOf(button);
    const removed = vi.spyOn(slot, 'removeEventListener');
    act(() => button.focus());
    expect(observerOf(slot)).toBeDefined();
    const observer = observerOf(slot)!;
    unmount();
    expect(observer.targets).toEqual([]);
    expect(disconnect).toHaveBeenCalled();
    expect(removed.mock.calls.map(([type]) => type).sort()).toEqual(['focusin', 'focusout']);
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
