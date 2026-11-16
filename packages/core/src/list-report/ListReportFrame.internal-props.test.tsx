import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { selectionActionsClass, selectionActionsWideOnlyClass } from './list-report-styles';
import { ListReport } from './ListReport';
import { ListReportFrame, type ListReportFrameInternalProps } from './ListReportFrame';
import { ListReportTable } from './ListReportTable';
import type { ListReportSelection } from './types';
import { useListReport } from './use-list-report';

// #504: the internal props of `ListReportFrame` that only `@formrail/pro` (`VirtualListReport`) passes.
// jsdom has no layout and no ResizeObserver: the observer records its callbacks, and what is "laid out" is
// what `checkVisibility` says, stubbed per test (as in ListReportTable.row-actions-inline.test.tsx).

const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  observers.length = 0;
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

function Host({
  bulkActions,
  rows = ROWS,
  ...internal
}: ListReportFrameInternalProps & { bulkActions?: (selection: ListReportSelection<Row>) => React.ReactNode; rows?: Row[] }) {
  const table = useListReport<Row>({ rows, columns: [{ id: 'name', header: 'Name', accessor: (r) => r.name }], getRowId: (r) => r.id, selectable: true });
  return (
    <ListReportFrame
      title="Items"
      table={table}
      bulkActions={bulkActions}
      renderTable={(tableProps) => <ListReportTable {...tableProps} />}
      {...internal}
    />
  );
}

const approve = () => <button type="button">Approve</button>;
const bar = (): HTMLElement => screen.getByRole('group', { name: /Selection/ });
const slotOf = (button: HTMLElement): HTMLElement => button.parentElement!;
const allBox = (): HTMLElement => screen.getByRole('checkbox', { name: 'Select all results' });

// "Laid out" = what `checkVisibility` says (jsdom: nothing is, unless stubbed).
function setLaidOut(laidOut: (el: Element) => boolean) {
  Element.prototype.checkVisibility ??= () => false;
  vi.spyOn(Element.prototype, 'checkVisibility').mockImplementation(function (this: Element) {
    return laidOut(this);
  });
}
const observerOf = (el: Element) => observers.find((o) => o.targets.includes(el));
const fire = (el: Element) => act(() => observerOf(el)!.callback([], {} as ResizeObserver));

describe('bulkActionsWideOnly: the bar of a frame whose only action is the Pro one', () => {
  it('the bar takes the one-line variant of a bar without bulkActions, and the slot is hidden below 640px (CSS)', () => {
    render(<Host bulkActions={approve} bulkActionsWideOnly />);
    expect(bar().getAttribute('data-rop-bulk-actions')).toBe('false');
    const slot = slotOf(screen.getByRole('button', { name: 'Approve' }));
    expect(slot.className.split(' ')).toEqual(expect.arrayContaining([...selectionActionsClass.split(' '), 'max-sm:hidden']));
    expect(selectionActionsWideOnlyClass).toBe('max-sm:hidden');
  });

  it('false or absent: the variant follows the presence of bulkActions as before, the slot has its classes only', () => {
    for (const wideOnly of [false, undefined]) {
      const { unmount } = render(<Host bulkActions={approve} bulkActionsWideOnly={wideOnly} />);
      expect(bar().getAttribute('data-rop-bulk-actions')).toBe('true');
      expect(slotOf(screen.getByRole('button', { name: 'Approve' })).className).toBe(selectionActionsClass);
      unmount();
    }
  });

  it('switching it on and off after mount flips the variant without remounting the bar or the slot', () => {
    const { rerender } = render(<Host bulkActions={approve} />);
    const node = bar();
    const slot = slotOf(screen.getByRole('button', { name: 'Approve' }));
    rerender(<Host bulkActions={approve} bulkActionsWideOnly />);
    expect(bar()).toBe(node);
    expect(slotOf(screen.getByRole('button', { name: 'Approve' }))).toBe(slot);
    expect(node.getAttribute('data-rop-bulk-actions')).toBe('false');
    rerender(<Host bulkActions={approve} />);
    expect(node.getAttribute('data-rop-bulk-actions')).toBe('true');
    expect(slot.className).toBe(selectionActionsClass);
  });

  it('never reaches the DOM: no attribute named after either internal prop, anywhere', () => {
    const { container } = render(<Host bulkActions={approve} bulkActionsWideOnly keepBulkActionsFocus />);
    const names = Array.from(container.querySelectorAll('*')).flatMap((el) => el.getAttributeNames());
    expect(names.filter((n) => /wideonly|keepbulk/i.test(n))).toEqual([]);
    expect(container.innerHTML).not.toMatch(/bulkActionsWideOnly|keepBulkActionsFocus/i);
  });
});

describe('keepBulkActionsFocus: a focused action hidden or removed hands the focus to the header checkbox', () => {
  it('the slot is hidden (below 640px) while an action has the focus: the focus goes to the header checkbox', () => {
    render(<Host bulkActions={approve} bulkActionsWideOnly keepBulkActionsFocus />);
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

  it('also while the hidden button still holds the focus (the observer runs before the browser drops it)', () => {
    render(<Host bulkActions={approve} bulkActionsWideOnly keepBulkActionsFocus />);
    const button = screen.getByRole('button', { name: 'Approve' });
    setLaidOut(() => true);
    act(() => button.focus());
    setLaidOut((el) => !slotOf(button).contains(el));
    fire(slotOf(button));
    expect(allBox()).toHaveFocus();
  });

  it('an action removed with the focus (the consumer dropped it): the focus goes to the header checkbox', async () => {
    setLaidOut((el) => el.isConnected);
    const { rerender } = render(<Host bulkActions={approve} keepBulkActionsFocus />);
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    // The slot stays (the Pro always passes its own action); the consumer's button goes away.
    rerender(<Host bulkActions={() => <span>Nothing</span>} keepBulkActionsFocus />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    // The change of the slot's children is seen by its MutationObserver (a microtask).
    await waitFor(() => expect(allBox()).toHaveFocus());
  });

  it('without results the header checkbox is disabled: the focus goes to the table container', () => {
    setLaidOut(() => true);
    render(<Host rows={[]} bulkActions={approve} bulkActionsWideOnly keepBulkActionsFocus />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    setLaidOut((el) => !slotOf(button).contains(el));
    fire(slotOf(button));
    expect(allBox()).toBeDisabled();
    expect(screen.getByRole('table', { name: 'Items' }).parentElement).toHaveFocus();
  });

  it('a focus the user moved elsewhere first is left where it is', async () => {
    setLaidOut(() => true);
    render(<Host bulkActions={approve} bulkActionsWideOnly keepBulkActionsFocus />);
    const button = screen.getByRole('button', { name: 'Approve' });
    const search = screen.getByRole('searchbox');
    act(() => button.focus());
    expect(observerOf(slotOf(button))).toBeDefined();
    await userEvent.click(search);
    // A blur that leaves the button laid out is the user moving on: no observer any more.
    expect(observerOf(slotOf(button))).toBeUndefined();
    setLaidOut((el) => !slotOf(button).contains(el));
    expect(search).toHaveFocus();
  });

  it('a resize of the slot while its action is still laid out moves nothing', () => {
    setLaidOut(() => true);
    render(<Host bulkActions={approve} bulkActionsWideOnly keepBulkActionsFocus />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    fire(slotOf(button));
    expect(button).toHaveFocus();
  });

  it('an environment without layout (nothing laid out at focus time) never moves the focus', () => {
    setLaidOut(() => false);
    render(<Host bulkActions={approve} bulkActionsWideOnly keepBulkActionsFocus />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    fire(slotOf(button));
    expect(button).toHaveFocus();
  });

  it('without keepBulkActionsFocus (ListReport): no observer, the focus of a removed action is not handled (unchanged)', async () => {
    setLaidOut((el) => el.isConnected);
    function Free({ withApprove }: { withApprove: boolean }) {
      const table = useListReport<Row>({ rows: ROWS, columns: [{ id: 'name', header: 'Name', accessor: (r) => r.name }], getRowId: (r) => r.id, selectable: true });
      return <ListReport title="Items" table={table} bulkActions={() => (withApprove ? approve() : <span>Nothing</span>)} />;
    }
    const { rerender } = render(<Free withApprove />);
    const button = screen.getByRole('button', { name: 'Approve' });
    act(() => button.focus());
    expect(observerOf(slotOf(button))).toBeUndefined();
    rerender(<Free withApprove={false} />);
    await act(async () => {});
    expect(allBox()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });
});
