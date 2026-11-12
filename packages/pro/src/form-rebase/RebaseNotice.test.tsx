import { act, createRef, useState, type ReactNode } from 'react';
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
    const renderValue = vi.fn((value: unknown) => String(value));
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
  function Harness({ initial, applied = [], moveFocus }: { initial: RebaseConflict[]; applied?: ChangeEntry[]; moveFocus?: () => void }) {
    const [conflicts, setConflicts] = useState(initial);
    const drop = (path: string) => {
      setConflicts((list) => list.filter((c) => c.path !== path));
      moveFocus?.();
    };
    return (
      <>
        <input aria-label="Due date input" />
        <RebaseNotice
          {...props({ applied, conflicts, onAcceptTheirs: drop, onKeepMine: drop, onAcceptAllTheirs: () => setConflicts([]) })}
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

describe('<RebaseNotice />: the focused field below keeps its place', () => {
  /** jsdom has no layout: the field's top is 100 without the strip, 100 + its height with it. */
  function layout(field: HTMLElement, stripHeight: number) {
    const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const notice = document.querySelector('.rop-pro-rebase-notice');
      const scroller = document.querySelector<HTMLElement>('[data-scroller]')!;
      if (this === notice) return rect(50, stripHeight);
      if (this === field) return rect(100 + (notice ? stripHeight : 0) - scroller.scrollTop, 20);
      return rect(0, 0);
    });
  }

  function Page({ conflicts, focusAbove }: { conflicts: RebaseConflict[]; focusAbove?: boolean }) {
    return (
      <div data-scroller="" style={{ overflowY: 'auto', height: 200 }}>
        {focusAbove ? <button type="button">Above</button> : null}
        <RebaseNotice {...props({ conflicts })} />
        <input aria-label="Due date" />
      </div>
    );
  }

  it('appearing and going away: the scroller is scrolled by the strip, the field does not move', () => {
    const view = render(<Page conflicts={[]} />);
    const field = screen.getByRole('textbox', { name: 'Due date' });
    const scroller = document.querySelector<HTMLElement>('[data-scroller]')!;
    layout(field, 80);
    field.focus();
    view.rerender(<Page conflicts={[DUE]} />);
    expect(scroller.scrollTop).toBe(80);
    expect(field.getBoundingClientRect().top).toBe(100);
    view.rerender(<Page conflicts={[]} />);
    expect(scroller.scrollTop).toBe(0);
    expect(field.getBoundingClientRect().top).toBe(100);
    expect(field).toHaveFocus();
    vi.restoreAllMocks();
  });

  it('no compensation when the focus is above the notice or nowhere', () => {
    const view = render(<Page conflicts={[]} focusAbove />);
    const field = screen.getByRole('textbox', { name: 'Due date' });
    const scroller = document.querySelector<HTMLElement>('[data-scroller]')!;
    layout(field, 80);
    screen.getByRole('button', { name: 'Above' }).focus();
    view.rerender(<Page conflicts={[DUE]} focusAbove />);
    expect(scroller.scrollTop).toBe(0);
    view.rerender(<Page conflicts={[]} focusAbove />);
    (document.activeElement as HTMLElement).blur();
    view.rerender(<Page conflicts={[DUE]} focusAbove />);
    expect(scroller.scrollTop).toBe(0);
    vi.restoreAllMocks();
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
