import { act, createRef, useRef, useState, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEntry } from '../change-summary/types';
import { RebaseNotice, type RebaseNoticeProps } from './RebaseNotice';
import type { RebaseConflict } from './types';

afterEach(cleanup);

const entry = (path: string, label: string): ChangeEntry => ({
  path,
  label,
  labelPath: label.split(' > '),
  kind: 'changed',
  before: 'a',
  after: 'b',
  beforeMissing: false,
  afterMissing: false,
});

const conflict = (path: string, label: string, mine: unknown, theirs: unknown, missing: Partial<Pick<RebaseConflict, 'mineMissing' | 'theirsMissing'>> = {}): RebaseConflict => ({
  path,
  label,
  base: undefined,
  mine,
  theirs,
  baseMissing: false,
  mineMissing: missing.mineMissing ?? false,
  theirsMissing: missing.theirsMissing ?? false,
});

const DUE = conflict('dueDate', 'Due date', new Date(Date.UTC(2026, 2, 5)), new Date(Date.UTC(2026, 2, 12)));
const NOTES = conflict('notes', 'Notes', 'Mine', 'Theirs');
const QTY = conflict('lines.1.qty', 'Lines > Item 2 > Qty', 2, 3);

function props(over: Partial<RebaseNoticeProps> = {}): RebaseNoticeProps {
  return {
    applied: [],
    conflicts: [],
    onAcceptTheirs: vi.fn(),
    onKeepMine: vi.fn(),
    onAcceptAllTheirs: vi.fn(),
    locale: 'en-US',
    timeZone: 'UTC',
    ...over,
  };
}

/** Text a screen reader gets: DOM order, visually hidden text included, aria-hidden excluded. */
function readText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return '';
  return Array.from(node.childNodes).map(readText).join('');
}

const live = () => screen.getByRole('status');
const strip = () => document.querySelector<HTMLElement>('.rop-pro-rebase-notice');

describe('<RebaseNotice />: rendering', () => {
  it('nothing to say: no strip, only the (empty) live region', () => {
    render(<RebaseNotice {...props()} />);
    expect(strip()).toBeNull();
    expect(live()).toHaveTextContent('');
    expect(live()).toHaveClass('rop-pro-rebase-notice__live');
  });

  it('applied only: information tone, the count, no list of conflicts', () => {
    render(<RebaseNotice {...props({ applied: [entry('status', 'Status'), entry('amount', 'Amount')] })} />);
    const node = strip()!;
    expect(readText(node)).toBe('Information: This record was updated while you were editing.2 fields were updated.');
    expect(within(node).queryByRole('list')).toBeNull();
    expect(node.querySelector('.text-rop-info')).not.toBeNull();
  });

  it('one applied change is singular', () => {
    render(<RebaseNotice {...props({ applied: [entry('status', 'Status')] })} />);
    expect(strip()).toHaveTextContent('1 field was updated.');
  });

  it('conflicts: warning tone, a named list, both values (formatted with locale/timeZone) and the two named choices', async () => {
    const onAcceptTheirs = vi.fn();
    const onKeepMine = vi.fn();
    render(<RebaseNotice {...props({ conflicts: [DUE, NOTES], onAcceptTheirs, onKeepMine })} />);
    expect(strip()!.querySelector('.text-rop-warning')).not.toBeNull();
    expect(strip()).toHaveTextContent('2 fields you edited were also changed on the server.');
    const items = within(screen.getByRole('list', { name: 'Conflicts' })).getAllByRole('listitem');
    expect(items.map(readText)).toEqual([
      'Due date Yours: Mar 5, 2026 Server: Mar 12, 2026 Use server value Keep mine',
      'Notes Yours: Mine Server: Theirs Use server value Keep mine',
    ]);
    // Visible text "Use server value", accessible name with the field (label in name).
    const accept = screen.getByRole('button', { name: 'Use server value for Due date' });
    expect(accept).toHaveTextContent('Use server value');
    await userEvent.click(accept);
    expect(onAcceptTheirs).toHaveBeenCalledWith('dueDate');
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine for Notes' }));
    expect(onKeepMine).toHaveBeenCalledWith('notes');
  });

  it('two values that read the same at the default level are told apart (precise rendering)', () => {
    render(<RebaseNotice {...props({ conflicts: [conflict('n', 'N', null, undefined)] })} />);
    expect(readText(screen.getByRole('listitem'))).toBe('N Yours: Null Server: Undefined Use server value Keep mine');
  });

  it('a side with no value reads "Removed", and renderValue is never called for it', () => {
    const renderValue = vi.fn((value: unknown) => <span>{`[${String(value)}]`}</span>);
    render(
      <RebaseNotice
        {...props({ conflicts: [conflict('lines.1', 'Lines > Item 2', 'row', undefined, { theirsMissing: true })], renderValue })}
      />,
    );
    expect(readText(screen.getByRole('listitem'))).toBe('Lines > Item 2 Yours: [row] Server: Removed Use server value Keep mine');
    expect(renderValue).toHaveBeenCalled();
    for (const [value] of renderValue.mock.calls) expect(value).toBe('row');
  });

  it('renderValue (the ChangeSummary one) gets the value and the conflict as a change from mine to theirs', () => {
    const renderValue = vi.fn((value: unknown, e: ChangeEntry): ReactNode => `${e.path}=${String(value)}`);
    render(<RebaseNotice {...props({ conflicts: [QTY], renderValue })} />);
    expect(renderValue).toHaveBeenCalledWith(2, {
      path: 'lines.1.qty',
      label: 'Lines > Item 2 > Qty',
      labelPath: ['Lines', 'Item 2', 'Qty'],
      kind: 'changed',
      before: 2,
      after: 3,
      beforeMissing: false,
      afterMissing: false,
    });
    expect(readText(screen.getByRole('listitem'))).toContain('Yours: lines.1.qty=2 Server: lines.1.qty=3');
  });

  it('renderValue gets the labelPath of an open conflict (useFormRebase) as it is, never the label split on " > "', () => {
    const renderValue = vi.fn((value: unknown, entry: ChangeEntry) => `${entry.path}=${String(value)}`);
    const open = { ...conflict('a.b', 'Size > large > Height', 1, 2), currentPath: 'a.b', labelPath: ['Size > large', 'Height'] };
    render(<RebaseNotice {...props({ conflicts: [open], renderValue })} />);
    expect(renderValue.mock.calls[0]![1]).toMatchObject({ labelPath: ['Size > large', 'Height'], label: 'Size > large > Height' });
  });

  it('"Use all server values" from two conflicts up, calling onAcceptAllTheirs', async () => {
    const onAcceptAllTheirs = vi.fn();
    const view = render(<RebaseNotice {...props({ conflicts: [DUE], onAcceptAllTheirs })} />);
    expect(screen.queryByRole('button', { name: 'Use all server values' })).toBeNull();
    view.rerender(<RebaseNotice {...props({ conflicts: [DUE, NOTES], onAcceptAllTheirs })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use all server values' }));
    expect(onAcceptAllTheirs).toHaveBeenCalledTimes(1);
  });

  it('pending: shown (and the strip appears for it alone)', () => {
    render(<RebaseNotice {...props({ pending: true })} />);
    expect(strip()).toHaveTextContent('Applying server update after saving…');
  });

  it('labels: partial overrides merged with the defaults; undefined keys keep the default', () => {
    render(
      <RebaseNotice
        {...props({
          applied: [entry('a', 'A')],
          conflicts: [NOTES],
          labels: { title: 'This invoice was updated while you were editing.', mine: 'Mine', acceptTheirsFor: (l) => `Take theirs: ${l}`, keepMine: undefined },
        })}
      />,
    );
    expect(strip()).toHaveTextContent('This invoice was updated while you were editing.');
    expect(screen.getByRole('listitem')).toHaveTextContent('Mine: Mine');
    expect(screen.getByRole('button', { name: 'Take theirs: Notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep mine for Notes' })).toHaveTextContent('Keep mine');
  });

  it('the strip is not a live region (the region is a separate element), forwards ref, className and attributes; no prop leaks to the DOM', () => {
    const ref = createRef<HTMLDivElement>();
    render(<RebaseNotice {...props({ applied: [entry('a', 'A')], conflicts: [NOTES] })} ref={ref} className="my-notice" data-testid="notice" />);
    const node = screen.getByTestId('notice');
    expect(ref.current).toBe(node);
    expect(node).toHaveClass('rop-pro-rebase-notice', 'my-notice');
    expect(node).not.toHaveAttribute('role');
    expect(node).not.toHaveAttribute('aria-live');
    expect(node.contains(live())).toBe(false);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    for (const name of ['applied', 'conflicts', 'pending', 'labels', 'locale', 'timezone', 'rendervalue']) {
      expect(node.hasAttribute(name), name).toBe(false);
    }
  });
});

describe('<RebaseNotice />: announcement', () => {
  /**
   * The texts the live region had, one per commit that changed it (a change of its text is what a screen reader
   * reads): `take()` after each render records the text if that render changed it.
   */
  function watch(region: HTMLElement) {
    const texts: string[] = [];
    const observer = new MutationObserver(() => undefined);
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    const take = () => {
      if (observer.takeRecords().length > 0) texts.push(region.textContent ?? '');
    };
    return { texts, take, stop: () => observer.disconnect() };
  }

  it('one announcement per update, from the region mounted before it; resolving or re-rendering announces nothing', async () => {
    const view = render(<RebaseNotice {...props()} />);
    const region = live();
    const { texts, take, stop } = watch(region);
    const applied = [entry('status', 'Status')];
    view.rerender(<RebaseNotice {...props({ applied, conflicts: [DUE, NOTES] })} />);
    take();
    // The same element as before the update: never a region created together with its message.
    expect(live()).toBe(region);
    expect(texts).toEqual([
      'This record was updated while you were editing. 1 field was updated. 2 fields you edited were also changed on the server.',
    ]);
    // A conflict resolved (same `applied`), a re-render with a new conflicts array: nothing more.
    view.rerender(<RebaseNotice {...props({ applied, conflicts: [NOTES] })} />);
    take();
    view.rerender(<RebaseNotice {...props({ applied, conflicts: [{ ...NOTES }] })} />);
    take();
    expect(texts).toHaveLength(1);
    stop();
  });

  it('a second update with the same text is announced again (the text still changes)', async () => {
    const view = render(<RebaseNotice {...props()} />);
    const { texts, take, stop } = watch(live());
    view.rerender(<RebaseNotice {...props({ applied: [entry('status', 'Status')] })} />);
    take();
    view.rerender(<RebaseNotice {...props({ applied: [entry('status', 'Status')] })} />);
    take();
    expect(texts).toHaveLength(2);
    expect(texts[0]).not.toBe(texts[1]);
    expect(texts[1]!.trim()).toBe(texts[0]);
    stop();
  });

  it('an update with nothing to show (empty lists) announces nothing', async () => {
    const view = render(<RebaseNotice {...props()} />);
    const { texts, take, stop } = watch(live());
    view.rerender(<RebaseNotice {...props({ applied: [] })} />);
    take();
    expect(texts).toEqual([]);
    stop();
  });

  it('pending is announced when it starts, then the update when it lands', async () => {
    const view = render(<RebaseNotice {...props()} />);
    const { texts, take, stop } = watch(live());
    view.rerender(<RebaseNotice {...props({ pending: true })} />);
    take();
    view.rerender(<RebaseNotice {...props({ pending: true })} />);
    take();
    view.rerender(<RebaseNotice {...props({ applied: [entry('status', 'Status')] })} />);
    take();
    expect(texts.map((t) => t.trim())).toEqual([
      'This record was updated while you were editing. Applying server update after saving…',
      'This record was updated while you were editing. 1 field was updated.',
    ]);
    stop();
  });

  it('a pending update that changes nothing once applied: the end is announced, the region never stays on "Applying…"', () => {
    const view = render(<RebaseNotice {...props()} />);
    const { texts, take, stop } = watch(live());
    view.rerender(<RebaseNotice {...props({ pending: true })} />);
    take();
    view.rerender(<RebaseNotice {...props({ pending: false, applied: [] })} />);
    take();
    expect(texts.map((t) => t.trim())).toEqual([
      'This record was updated while you were editing. Applying server update after saving…',
      'This record was updated while you were editing. Server update applied after saving: no field changed.',
    ]);
    expect(strip()).toBeNull();
    stop();
  });

  it('an update never moves the focus', () => {
    const view = render(
      <>
        <input aria-label="Notes" />
        <RebaseNotice {...props()} />
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Notes' });
    input.focus();
    view.rerender(
      <>
        <input aria-label="Notes" />
        <RebaseNotice {...props({ applied: [entry('status', 'Status')], conflicts: [DUE, NOTES] })} />
      </>,
    );
    expect(input).toHaveFocus();
  });
});

describe('<RebaseNotice />: focus after a choice', () => {
  /** A notice whose choices remove the conflict, as `useFormRebase` does. */
  function Harness({
    initial,
    applied = [],
    moveFocus,
    focusTargetFor,
  }: {
    initial: RebaseConflict[];
    applied?: ChangeEntry[];
    moveFocus?: () => void;
    focusTargetFor?: RebaseNoticeProps['focusTargetFor'];
  }) {
    const [conflicts, setConflicts] = useState(initial);
    const drop = (path: string) => {
      setConflicts((list) => list.filter((c) => c.path !== path));
      moveFocus?.();
    };
    return (
      <>
        <input aria-label="Due date input" />
        <RebaseNotice
          {...props({ applied, conflicts, onAcceptTheirs: drop, onKeepMine: drop, onAcceptAllTheirs: () => setConflicts([]), focusTargetFor })}
        />
      </>
    );
  }

  it('goes to the same choice of the conflict that takes its place, else of the previous one', async () => {
    render(<Harness initial={[DUE, NOTES, QTY]} applied={[entry('status', 'Status')]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine for Notes' }));
    expect(screen.getByRole('button', { name: 'Keep mine for Lines > Item 2 > Qty' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Use server value for Lines > Item 2 > Qty' }));
    expect(screen.getByRole('button', { name: 'Use server value for Due date' })).toHaveFocus();
  });

  it('the first of three conflicts closed: the same choice of the new first one', async () => {
    render(<Harness initial={[DUE, NOTES, QTY]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine for Due date' }));
    expect(screen.getByRole('button', { name: 'Keep mine for Notes' })).toHaveFocus();
  });

  it('the last conflict closed with a mouse click and no focus before (nothing of the notice left): focusTargetFor(conflict) takes the focus', async () => {
    const target = vi.fn((c: RebaseConflict) => (c.path === 'dueDate' ? screen.getByRole('textbox', { name: 'Due date input' }) : null));
    render(<Harness initial={[DUE]} focusTargetFor={target} />);
    expect(document.activeElement).toBe(document.body);
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine for Due date' }));
    expect(strip()).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Due date input' })).toHaveFocus();
    expect(target).toHaveBeenCalledWith(expect.objectContaining({ path: 'dueDate' }));
  });

  it('focusTargetFor wins over where the focus came from; the strip is the last resort', async () => {
    const other = document.createElement('input');
    other.setAttribute('aria-label', 'Other');
    document.body.appendChild(other);
    try {
      render(<Harness initial={[DUE]} applied={[entry('status', 'Status')]} focusTargetFor={() => screen.getByRole('textbox', { name: 'Due date input' })} />);
      await userEvent.click(other);
      await userEvent.click(screen.getByRole('button', { name: 'Use server value for Due date' }));
      expect(screen.getByRole('textbox', { name: 'Due date input' })).toHaveFocus();
    } finally {
      other.remove();
    }
  });

  it('the focus left the notice for <body> (blur), then the conflict closes: the focus is not taken back', () => {
    const view = render(<RebaseNotice {...props({ applied: [entry('status', 'Status')], conflicts: [DUE, NOTES] })} />);
    const button = screen.getByRole('button', { name: 'Keep mine for Notes' });
    button.focus();
    button.blur();
    expect(document.activeElement).toBe(document.body);
    view.rerender(<RebaseNotice {...props({ applied: [entry('status', 'Status')], conflicts: [DUE] })} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('the last conflict: back to where the focus was before entering the notice', async () => {
    render(<Harness initial={[DUE]} />);
    const input = screen.getByRole('textbox', { name: 'Due date input' });
    await userEvent.click(input);
    await userEvent.click(screen.getByRole('button', { name: 'Use server value for Due date' }));
    expect(strip()).toBeNull();
    expect(input).toHaveFocus();
  });

  it('the last conflict, came from nowhere, the strip stays (applied): the strip takes the focus', async () => {
    render(<Harness initial={[DUE]} applied={[entry('status', 'Status')]} />);
    screen.getByRole('button', { name: 'Keep mine for Due date' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(strip()).toHaveFocus();
    expect(strip()).toHaveAttribute('tabindex', '-1');
  });

  it('"Use all server values": back to where the focus was before', async () => {
    render(<Harness initial={[DUE, NOTES]} applied={[entry('status', 'Status')]} />);
    const input = screen.getByRole('textbox', { name: 'Due date input' });
    await userEvent.click(input);
    await userEvent.click(screen.getByRole('button', { name: 'Use all server values' }));
    expect(input).toHaveFocus();
  });

  it('a callback that moves the focus itself wins', async () => {
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    try {
      render(<Harness initial={[DUE, NOTES]} moveFocus={() => elsewhere.focus()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Keep mine for Due date' }));
      expect(elsewhere).toHaveFocus();
    } finally {
      elsewhere.remove();
    }
  });

  it('a conflict closed while the focus is elsewhere moves nothing', async () => {
    const view = render(
      <>
        <input aria-label="Other" />
        <RebaseNotice {...props({ conflicts: [DUE, NOTES] })} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine for Notes' }));
    const other = screen.getByRole('textbox', { name: 'Other' });
    await userEvent.click(other);
    view.rerender(
      <>
        <input aria-label="Other" />
        <RebaseNotice {...props({ conflicts: [DUE] })} />
      </>,
    );
    expect(other).toHaveFocus();
  });
});

describe('<RebaseNotice />: the content in view never moves (#384, second review)', () => {
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  /**
   * jsdom has no layout. Inside the container: the element after the notice is at 100 without the strip, 100 +
   * its height with it, minus the container's scroll. `strip` is the height the strip has when rendered.
   */
  function insideLayout(stripHeight: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const notice = document.querySelector('.rop-pro-rebase-notice');
      const scroller = document.querySelector<HTMLElement>('[data-scroller]')!;
      if (this === notice) return rect(50, stripHeight);
      if (this === scroller) return rect(0, 200);
      if (this.matches('[aria-label="Due date"]')) return rect(100 + (notice ? stripHeight : 0) - scroller.scrollTop, 20);
      if (this.matches('button')) return rect(10 - scroller.scrollTop, 20);
      return rect(0, 0);
    });
  }

  function Inside({ conflicts }: { conflicts: RebaseConflict[] }) {
    return (
      <div data-scroller="" style={{ overflowY: 'auto', height: 200 }}>
        <button type="button">Above</button>
        <RebaseNotice {...props({ conflicts })} />
        <input aria-label="Due date" />
      </div>
    );
  }

  for (const focus of ['the field after the notice', 'a button above the notice', 'nothing'] as const) {
    it(`focus on ${focus}: appearing and going away scroll the container by as much, the field after it does not move`, () => {
      const view = render(<Inside conflicts={[]} />);
      const field = screen.getByRole('textbox', { name: 'Due date' });
      const scroller = document.querySelector<HTMLElement>('[data-scroller]')!;
      insideLayout(80);
      if (focus === 'the field after the notice') field.focus();
      if (focus === 'a button above the notice') screen.getByRole('button', { name: 'Above' }).focus();
      // The mocked layout replaces the real one: a resize makes the notice record where the content is now.
      window.dispatchEvent(new Event('resize'));
      const before = field.getBoundingClientRect().top;
      view.rerender(<Inside conflicts={[DUE]} />);
      expect(scroller.scrollTop).toBe(80);
      expect(field.getBoundingClientRect().top).toBe(before);
      view.rerender(<Inside conflicts={[]} />);
      expect(scroller.scrollTop).toBe(0);
      expect(field.getBoundingClientRect().top).toBe(before);
      vi.restoreAllMocks();
    });
  }

  it('outside the container, right above it (scrollContainerRef): the container scrolls by the notice, a covered focused field is brought back into view', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    function Page({ conflicts }: { conflicts: RebaseConflict[] }) {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div>
          <div data-notice-row="">
            <RebaseNotice {...props({ conflicts, scrollContainerRef: ref })} />
          </div>
          <div data-page="">
            <div data-scroller="" ref={ref} style={{ overflowY: 'auto', height: 200 }}>
              <input aria-label="Top field" />
              <input aria-label="Due date" />
            </div>
          </div>
        </div>
      );
    }
    const view = render(<Page conflicts={[]} />);
    const scroller = document.querySelector<HTMLElement>('[data-scroller]')!;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const strip = document.querySelector('.rop-pro-rebase-notice') ? 80 : 0;
      // The page (and its scroller) start below the notice; the fields move inside the scroller.
      if (this.matches('[data-page]')) return rect(strip, 400);
      if (this === scroller) return rect(strip, 200);
      if (this.matches('[aria-label="Top field"]')) return rect(strip + 10 - scroller.scrollTop, 20);
      if (this.matches('[aria-label="Due date"]')) return rect(strip + 150 - scroller.scrollTop, 20);
      return rect(0, 0);
    });
    const due = screen.getByRole('textbox', { name: 'Due date' });
    due.focus();
    window.dispatchEvent(new Event('resize'));
    const before = due.getBoundingClientRect().top;
    view.rerender(<Page conflicts={[DUE]} />);
    expect(scroller.scrollTop).toBe(80);
    expect(due.getBoundingClientRect().top).toBe(before);
    expect(scrollIntoView).not.toHaveBeenCalled();
    view.rerender(<Page conflicts={[]} />);
    expect(scroller.scrollTop).toBe(0);
    expect(due.getBoundingClientRect().top).toBe(before);
    // The focused field was in the top strip of the container: covered once the notice is there -> into view.
    screen.getByRole('textbox', { name: 'Top field' }).focus();
    view.rerender(<Page conflicts={[DUE]} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

describe('<RebaseNotice />: focus not obscured (WCAG 2.4.11, #470)', () => {
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  const STRIP = 80;
  const BAR = 30;

  /**
   * The recommended placement (the notice right above the container), with a sticky bar stuck at the top of the
   * container (an Anchor Bar). jsdom has no layout: every box is mocked, the container scrolls by `scrollTop`, and
   * `scrollIntoView` aligns the element's top with the container's (what `block: 'nearest'` does from above).
   */
  function Page({ conflicts }: { conflicts: RebaseConflict[] }) {
    const ref = useRef<HTMLDivElement>(null);
    return (
      <div>
        <div data-notice-row="">
          <RebaseNotice {...props({ conflicts, scrollContainerRef: ref })} />
        </div>
        <div data-page="">
          <div data-scroller="" ref={ref} style={{ overflowY: 'auto', height: 200 }}>
            <nav data-bar="" style={{ position: 'sticky', top: 0 }}>
              <a href="#due">Bar link</a>
            </nav>
            <button type="button">Back</button>
            <input aria-label="Top field" />
            <input aria-label="Due date" id="due" />
          </div>
        </div>
      </div>
    );
  }

  function setup() {
    const view = render(<Page conflicts={[]} />);
    const scroller = document.querySelector<HTMLElement>('[data-scroller]')!;
    const bar = document.querySelector<HTMLElement>('[data-bar]')!;
    const top = () => (document.querySelector('.rop-pro-rebase-notice') ? STRIP : 0);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.matches('[data-page]')) return rect(top(), 400);
      if (this === scroller) return rect(top(), 200);
      if (this === bar || this.matches('[data-bar] a')) return rect(top(), BAR);
      if (this.matches('button')) return rect(top() + 40 - scroller.scrollTop, 20);
      if (this.matches('[aria-label="Top field"]')) return rect(top() + 70 - scroller.scrollTop, 20);
      if (this.matches('[aria-label="Due date"]')) return rect(top() + 150 - scroller.scrollTop, 20);
      return rect(0, 0);
    });
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      scroller.scrollTop -= scroller.getBoundingClientRect().top - this.getBoundingClientRect().top;
    });
    Element.prototype.scrollIntoView = scrollIntoView;
    // The point just under the container's top edge is the bar's while the bar is there.
    const link = bar.querySelector('a')!;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((_x: number, y: number) => (y < top() + BAR ? link : scroller)),
    });
    window.dispatchEvent(new Event('resize'));
    return { view, scroller, scrollIntoView, link };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  /** Makes `element` match `:focus-visible` (keyboard) or not (pointer), whatever jsdom decides. */
  function modality(element: HTMLElement, shown: boolean) {
    const matches = Element.prototype.matches;
    vi.spyOn(element, 'matches').mockImplementation(function (this: HTMLElement, selector: string) {
      return selector === ':focus-visible' ? shown : matches.call(this, selector);
    });
  }

  it('a button in the covered strip, reached with the keyboard: back in view, below the sticky bar (the content moves by the least)', () => {
    const { view, scroller, scrollIntoView } = setup();
    const back = screen.getByRole('button', { name: 'Back' });
    back.focus();
    modality(back, true);
    view.rerender(<Page conflicts={[DUE]} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // The container top is at 80, the bar ends at 110: the button starts 8px below it.
    expect(back.getBoundingClientRect().top).toBe(STRIP + BAR + 8);
    expect(scroller.scrollTop).toBe(2);
    expect(back).toHaveFocus();
  });

  it('the same button pressed with a pointer (no focus indicator): the content does not move for it', () => {
    const { view, scroller, scrollIntoView } = setup();
    const back = screen.getByRole('button', { name: 'Back' });
    back.focus();
    modality(back, false);
    const due = screen.getByRole('textbox', { name: 'Due date' });
    const before = due.getBoundingClientRect().top;
    view.rerender(<Page conflicts={[DUE]} />);
    expect(scroller.scrollTop).toBe(STRIP);
    expect(due.getBoundingClientRect().top).toBe(before);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(back).toHaveFocus();
  });

  it('a field being typed in, in the covered strip: back in view and no longer under the sticky bar (the pointer does not matter)', () => {
    const { view, scroller } = setup();
    const field = screen.getByRole('textbox', { name: 'Top field' });
    field.focus();
    modality(field, false);
    view.rerender(<Page conflicts={[DUE]} />);
    expect(field.getBoundingClientRect().top).toBe(STRIP + BAR + 8);
    expect(scroller.scrollTop).toBe(32);
  });

  it('a focused control outside the strip, or inside the sticky bar itself, moves nothing', () => {
    const { view, scroller, scrollIntoView, link } = setup();
    const due = screen.getByRole('textbox', { name: 'Due date' });
    due.focus();
    const before = due.getBoundingClientRect().top;
    view.rerender(<Page conflicts={[DUE]} />);
    expect(scroller.scrollTop).toBe(STRIP);
    expect(due.getBoundingClientRect().top).toBe(before);
    view.rerender(<Page conflicts={[]} />);
    expect(scroller.scrollTop).toBe(0);
    link.focus();
    modality(link, true);
    view.rerender(<Page conflicts={[DUE]} />);
    expect(scroller.scrollTop).toBe(STRIP);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('<RebaseNotice />: the box it sits in resized from outside (#470)', () => {
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  it('outside the container: a scroll position the browser clamped in the relayout (no scroll event yet) is not counted twice', () => {
    function Page({ conflicts }: { conflicts: RebaseConflict[] }) {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div>
          <div data-notice-row="">
            <RebaseNotice {...props({ conflicts, scrollContainerRef: ref })} />
          </div>
          <div data-page="">
            <div data-scroller="" ref={ref} style={{ overflowY: 'auto', height: 200 }}>
              <input aria-label="Due date" />
            </div>
          </div>
        </div>
      );
    }
    const view = render(<Page conflicts={[DUE]} />);
    const scroller = document.querySelector<HTMLElement>('[data-scroller]')!;
    const height = { strip: 80 };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const row = document.querySelector('.rop-pro-rebase-notice') ? height.strip : 0;
      if (this.matches('[data-page]')) return rect(row, 400);
      if (this === scroller) return rect(row, 200);
      return rect(0, 0);
    });
    try {
      // At the bottom of the content (scrollTop 300): recorded there.
      scroller.scrollTop = 300;
      window.dispatchEvent(new Event('resize'));
      // The strip shrinks by 30: the container grows by 30 at its top, and the browser, at the end of the content,
      // already pulled its scroll position up by those 30px in the relayout (no scroll event dispatched yet).
      height.strip = 50;
      scroller.scrollTop = 270;
      view.rerender(<Page conflicts={[NOTES]} />);
      // 300 - 30, not 270 - 30: the content in view does not move.
      expect(scroller.scrollTop).toBe(270);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('a consumer that caps the notice row (no render of the notice): recorded again, the next render does not scroll by that move', () => {
    const callbacks: ResizeObserverCallback[] = [];
    const observed: Element[] = [];
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    function Page({ conflicts }: { conflicts: RebaseConflict[] }) {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div>
          <div data-notice-row="">
            <RebaseNotice {...props({ conflicts, scrollContainerRef: ref })} />
          </div>
          <div data-page="">
            <div data-scroller="" ref={ref} style={{ overflowY: 'auto', height: 200 }}>
              <input aria-label="Due date" />
            </div>
          </div>
        </div>
      );
    }
    // The height of the notice row: the strip's, unless the consumer caps it.
    const layout = { cap: Infinity };
    const row = () => (document.querySelector('.rop-pro-rebase-notice') ? Math.min(80, layout.cap) : 0);
    try {
      const view = render(<Page conflicts={[]} />);
      const scroller = document.querySelector<HTMLElement>('[data-scroller]')!;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.matches('[data-page]')) return rect(row(), 400);
        if (this === scroller) return rect(row(), 200);
        if (this.matches('[aria-label="Due date"]')) return rect(row() + 150 - scroller.scrollTop, 20);
        return rect(0, 0);
      });
      window.dispatchEvent(new Event('resize'));
      expect(observed).toContain(document.querySelector('[data-notice-row]'));
      view.rerender(<Page conflicts={[DUE]} />);
      expect(scroller.scrollTop).toBe(80);
      // The keyboard opens: the consumer caps the row at 50px, the page moves up by 30px (no render of the notice).
      layout.cap = 50;
      act(() => {
        for (const callback of callbacks) callback([], {} as ResizeObserver);
      });
      // A later render of the notice (a second conflict arrives with the same strip height) scrolls by nothing.
      view.rerender(<Page conflicts={[DUE, NOTES]} />);
      expect(scroller.scrollTop).toBe(80);
      view.unmount();
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});

describe('<RebaseNotice />: server rendering', () => {
  it('hydrates the server HTML (explicit locale and time zone) without a mismatch', async () => {
    const tree = <RebaseNotice {...props({ applied: [entry('status', 'Status')], conflicts: [DUE] })} />;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverable = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      container.innerHTML = renderToString(tree);
      expect(container.textContent).toContain('Mar 12, 2026');
      let root: ReturnType<typeof hydrateRoot> | undefined;
      await act(async () => {
        root = hydrateRoot(container, tree, { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      act(() => root!.unmount());
    } finally {
      container.remove();
      errors.mockRestore();
    }
  });
});
