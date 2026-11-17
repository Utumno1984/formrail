import { createRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
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
    // #571: `keepBulkActionsFocus` is gone (its rule lives in the Pro); the frame's second internal prop is now
    // `bulkActionsSlotRef`. Both names stay in the patterns.
    const { container } = render(<Host bulkActions={approve} bulkActionsWideOnly bulkActionsSlotRef={createRef()} />);
    const names = Array.from(container.querySelectorAll('*')).flatMap((el) => el.getAttributeNames());
    expect(names.filter((n) => /wideonly|keepbulk|slotref/i.test(n))).toEqual([]);
    expect(container.innerHTML).not.toMatch(/bulkActionsWideOnly|keepBulkActionsFocus|bulkActionsSlotRef/i);
  });
});

describe('bulkActionsSlotRef: the slot of the bulk actions, for the focus rule of the Pro (#571)', () => {
  it('receives the slot that wraps what bulkActions returns, and null once the slot is gone', () => {
    const slotRef = createRef<HTMLDivElement>();
    const { rerender } = render(<Host bulkActions={approve} bulkActionsSlotRef={slotRef} />);
    expect(slotRef.current).toBe(slotOf(screen.getByRole('button', { name: 'Approve' })));
    expect(slotRef.current).toHaveClass(...selectionActionsClass.split(' '));
    rerender(<Host bulkActionsSlotRef={slotRef} />);
    expect(slotRef.current).toBeNull();
  });

  it('only a ref: an action of the slot that has the focus and is removed is not handled by the frame (the rule is the Pro hook, see @formrail/pro use-keep-bulk-actions-focus)', async () => {
    setLaidOut((el) => el.isConnected);
    const slotRef = createRef<HTMLDivElement>();
    const { rerender } = render(<Host bulkActions={approve} bulkActionsSlotRef={slotRef} />);
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    expect(observers.filter((o) => o.targets.includes(slotRef.current!))).toEqual([]);
    rerender(<Host bulkActions={() => <span>Nothing</span>} bulkActionsSlotRef={slotRef} />);
    await act(async () => {});
    expect(allBox()).not.toHaveFocus();
  });
});

// The tests of the rule itself (the focus of a hidden or removed action) moved with it to `@formrail/pro`
// (`use-keep-bulk-actions-focus.test.tsx`, #571), with their titles and assertions. The Free one stays here.
describe('keepBulkActionsFocus: a focused action hidden or removed hands the focus to the header checkbox', () => {
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
