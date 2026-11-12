import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { Button, MessageStrip, cn, composeRefs } from '@formrail/core';
import {
  distinctValueTexts,
  formatChangeValueAt,
  isMutedValue,
  type FormatChangeValueOptions,
} from '../change-summary/format-change-value';
import type { ChangeEntry } from '../change-summary/types';
import { useIsomorphicLayoutEffect } from '../internal/use-isomorphic-layout-effect';
import type { RebaseConflict } from './types';

/** Texts of `<RebaseNotice />` (all overridable through `labels`). */
export interface RebaseNoticeLabels {
  /** Title of the notice, first sentence of the announcement. Default `'This record was updated while you were editing.'` */
  title: string;
  /** The count of server changes applied. Default `1 field was updated.` / `N fields were updated.` */
  applied: (count: number) => string;
  /** Above the conflicts. Default `1 field you edited was also changed on the server.` / `N fields you edited were also changed on the server.` */
  conflicts: (count: number) => string;
  /** Accessible name of the list of conflicts. Default `'Conflicts'`. */
  conflictList: string;
  /** Before the user's value. Default `'Yours'`. */
  mine: string;
  /** Before the server's value. Default `'Server'`. */
  theirs: string;
  /** A side that has no value (an item removed, a key absent on that side). Default `'Removed'`. */
  missing: string;
  /** Visible text of the button that takes the server value. Default `'Use server value'`. */
  acceptTheirs: string;
  /** Accessible name of that button, with the conflict's label. Default `Use server value for <label>`. */
  acceptTheirsFor: (label: string) => string;
  /** Visible text of the button that keeps the user's value. Default `'Keep mine'`. */
  keepMine: string;
  /** Accessible name of that button, with the conflict's label. Default `Keep mine for <label>`. */
  keepMineFor: (label: string) => string;
  /** The button that takes every server value (shown from two conflicts up). Default `'Use all server values'`. */
  acceptAllTheirs: string;
  /** Shown and announced while an update waits for a save in flight. Default `'Applying server update after saving…'`. */
  pending: string;
  /**
   * Appended in parentheses to the server's value when both values still read the same with
   * their contents written out (two class instances, a difference past the truncation). Default `'contents differ'`.
   */
  contentsDiffer: string;
}

export const DEFAULT_REBASE_NOTICE_LABELS: RebaseNoticeLabels = {
  title: 'This record was updated while you were editing.',
  applied: (count) => (count === 1 ? '1 field was updated.' : `${count} fields were updated.`),
  conflicts: (count) =>
    count === 1
      ? '1 field you edited was also changed on the server.'
      : `${count} fields you edited were also changed on the server.`,
  conflictList: 'Conflicts',
  mine: 'Yours',
  theirs: 'Server',
  missing: 'Removed',
  acceptTheirs: 'Use server value',
  acceptTheirsFor: (label) => `Use server value for ${label}`,
  keepMine: 'Keep mine',
  keepMineFor: (label) => `Keep mine for ${label}`,
  acceptAllTheirs: 'Use all server values',
  pending: 'Applying server update after saving…',
  // A literal, not `DEFAULT_VALUE_LABELS.contentsDiffer`: a member read at module level is never tree-shaken.
  contentsDiffer: 'contents differ',
};

export interface RebaseNoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title' | 'role'> {
  /** The server changes applied to fields the user did not touch: `useFormRebase().applied`. Counted, not listed. */
  applied: readonly ChangeEntry[];
  /** The open conflicts, `useFormRebase().conflicts`: each with both values and the two choices. */
  conflicts: readonly RebaseConflict[];
  /** "Use server value": typically `useFormRebase().acceptTheirs`, called with the conflict's `path`. */
  onAcceptTheirs: (path: string) => void;
  /** "Keep mine": typically `useFormRebase().keepMine`, called with the conflict's `path`. */
  onKeepMine: (path: string) => void;
  /** "Use all server values" (shown from two conflicts up): typically `useFormRebase().acceptAllTheirs`. */
  onAcceptAllTheirs: () => void;
  /** `useFormRebase().isPending`: an update is waiting for a save in flight. Default `false`. */
  pending?: boolean;
  /** Overrides of the texts, merged with {@link DEFAULT_REBASE_NOTICE_LABELS}. */
  labels?: Partial<RebaseNoticeLabels>;
  /**
   * Replaces the default text of a value: the same function as `ChangeSummary`'s `renderValue`. Called for
   * each value shown, with the value and the conflict as a change from the user's value to the server's
   * (`kind: 'changed'`, `before` = `mine`, `after` = `theirs`; `labelPath` = the conflict's own for an open conflict of
   * `useFormRebase`, the label split on ` > ` for a conflict of `computeRebase`).
   * Never called for a side with no value (`mineMissing` / `theirsMissing`): that side reads `labels.missing`.
   */
  renderValue?: (value: unknown, entry: ChangeEntry) => ReactNode;
  /** BCP 47 locale of the default number and date formatting. Default: the runtime locale. */
  locale?: string;
  /** IANA time zone of the default date formatting. Default: the runtime time zone. */
  timeZone?: string;
}

const RN = 'rop-pro-rebase-notice';
const NO_BREAK_SPACE = '\u00a0';
type Action = 'theirs' | 'mine' | 'all';

/** The element focused inside the notice, and where it was (to find its heir once it is gone). */
interface Focused {
  element: HTMLElement;
  index: number;
  action: Action;
}

const merged = (labels: Partial<RebaseNoticeLabels> | undefined): RebaseNoticeLabels => {
  const out = { ...DEFAULT_REBASE_NOTICE_LABELS };
  for (const key of Object.keys(labels ?? {}) as (keyof RebaseNoticeLabels)[]) {
    const value = labels?.[key];
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
};

const toEntry = (conflict: RebaseConflict): ChangeEntry => ({
  path: conflict.path,
  label: conflict.label,
  // An open conflict of `useFormRebase` carries its labels; a conflict of `computeRebase` has only the joined label.
  labelPath: 'labelPath' in conflict && Array.isArray(conflict.labelPath) ? (conflict.labelPath as string[]) : conflict.label.split(' > '),
  kind: 'changed',
  before: conflict.mine,
  after: conflict.theirs,
  beforeMissing: conflict.mineMissing,
  afterMissing: conflict.theirsMissing,
});

/** The nearest vertical scroll container of `node` (the document's when there is none). */
function scrollerOf(node: Element): Element {
  const view = node.ownerDocument.defaultView;
  for (let el = node.parentElement; el; el = el.parentElement) {
    const overflow = view?.getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return el;
  }
  return node.ownerDocument.scrollingElement ?? node.ownerDocument.documentElement;
}

const isLost = (doc: Document): boolean => doc.activeElement === null || doc.activeElement === doc.body;

/**
 * "This record was updated while you were editing": the result of a `useFormRebase` rebase, as a
 * `MessageStrip` (information when only `applied`, warning with conflicts). It shows how many server
 * changes were applied and lists every conflict with both values ("Yours" / "Server", formatted like
 * `ChangeSummary`) and two choices, "Use server value" and "Keep mine", named after the field ("Use
 * server value for Due date"). Shown while there is something to say (`applied`, `conflicts` or
 * `pending`), nothing otherwise.
 *
 * **Keep it mounted** (also with empty lists): it owns a polite live region, always in the document,
 * that announces each update ONCE (a region created together with its message may be skipped by a
 * screen reader). An update is a new `applied` array (`useFormRebase` gives a new one per rebase and
 * keeps it while conflicts are resolved): pass the hook's array, not a copy made at every render.
 * The focus is never moved by an update (the user may be typing).
 *
 * **Layout**: inside a scroll container (an `ObjectPage`), when the notice appears, grows, shrinks or
 * goes away, the element that has the focus below it stays where it is on screen (the container is
 * scrolled by the same amount): a field the user is typing in never jumps. Without a focused element
 * below it the content moves as the browser's scroll anchoring decides.
 *
 * **Focus**: when a choice removes the element that had the focus, the focus goes to the same choice of
 * the conflict that takes its place (the next one, else the previous one), else back to where it was
 * before entering the notice, else to the notice itself (focusable from script only). A callback that
 * moves the focus itself wins.
 */
export const RebaseNotice = /* @__PURE__ */ forwardRef<HTMLDivElement, RebaseNoticeProps>(function RebaseNotice(
  {
    applied,
    conflicts,
    onAcceptTheirs,
    onKeepMine,
    onAcceptAllTheirs,
    pending = false,
    labels: labelsProp,
    renderValue,
    locale,
    timeZone,
    className,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const labels = merged(labelsProp);
  const visible = applied.length > 0 || conflicts.length > 0 || pending;
  const format: FormatChangeValueOptions = { locale, timeZone };

  const liveRef = useRef<HTMLSpanElement>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const stripRefs = useMemo(() => composeRefs(ref, stripRef), [ref]);

  /* ---------------------------------------------------------------------------------------------- */
  /* Announcement: once per update, from the region that is always mounted.                         */
  /* ---------------------------------------------------------------------------------------------- */
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef<{ applied: readonly ChangeEntry[] | null; pending: boolean; count: number }>({
    applied: null,
    pending: false,
    count: 0,
  });
  const message = [labels.title, applied.length > 0 ? labels.applied(applied.length) : '', conflicts.length > 0 ? labels.conflicts(conflicts.length) : '']
    .filter(Boolean)
    .join(' ');
  useEffect(() => {
    const last = announced.current;
    let text: string | undefined;
    if (pending && !last.pending) text = `${labels.title} ${labels.pending}`;
    else if (applied !== last.applied && (applied.length > 0 || conflicts.length > 0)) text = message;
    announced.current = { applied, pending, count: last.count };
    if (text === undefined) return;
    // A trailing no-break space on every other update: the same text twice in a row is still a change.
    announced.current.count += 1;
    setAnnouncement(announced.current.count % 2 === 0 ? `${text}${NO_BREAK_SPACE}` : text);
  }, [applied, pending, conflicts.length, message, labels.title, labels.pending]);

  /* ---------------------------------------------------------------------------------------------- */
  /* Layout: the focused element below the notice keeps its place on screen.                        */
  /* ---------------------------------------------------------------------------------------------- */
  const anchor = useRef<{ element: Element; top: number } | null>(null);
  const lastHeight = useRef(0);
  /** The focused element after the notice in the same scroll container, with its current top. */
  const record = useCallback(() => {
    const live = liveRef.current;
    anchor.current = null;
    if (!live) return;
    const doc = live.ownerDocument;
    const active = doc.activeElement;
    if (!active || active === doc.body || stripRef.current?.contains(active)) return;
    if (!(live.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
    if (!scrollerOf(live).contains(active)) return;
    anchor.current = { element: active, top: active.getBoundingClientRect().top };
  }, []);

  useIsomorphicLayoutEffect(() => {
    const height = stripRef.current?.getBoundingClientRect().height ?? 0;
    const held = anchor.current;
    if (height !== lastHeight.current && held && held.element.isConnected && held.element === held.element.ownerDocument.activeElement) {
      const delta = held.element.getBoundingClientRect().top - held.top;
      if (delta !== 0 && liveRef.current) {
        const scroller = scrollerOf(liveRef.current);
        scroller.scrollTop += delta;
      }
    }
    lastHeight.current = height;
    record();
  });

  // Between two renders the anchor moves only by a scroll, a focus change or a resize: record it again then.
  useEffect(() => {
    const doc = liveRef.current?.ownerDocument;
    const view = doc?.defaultView;
    if (!doc || !view) return undefined;
    doc.addEventListener('scroll', record, { capture: true, passive: true });
    doc.addEventListener('focusin', record);
    view.addEventListener('resize', record);
    return () => {
      doc.removeEventListener('scroll', record, { capture: true });
      doc.removeEventListener('focusin', record);
      view.removeEventListener('resize', record);
    };
  }, [record]);

  /* ---------------------------------------------------------------------------------------------- */
  /* Focus: a choice that removes the focused button never leaves the focus on <body>.              */
  /* ---------------------------------------------------------------------------------------------- */
  const focused = useRef<Focused | null>(null);
  const cameFrom = useRef<HTMLElement | null>(null);

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    onFocus?.(event);
    const strip = stripRef.current;
    const from = event.relatedTarget;
    if (strip && from instanceof HTMLElement && !strip.contains(from)) cameFrom.current = from;
    const target = event.target.closest<HTMLElement>('[data-rebase-action]');
    focused.current = target
      ? { element: target, index: Number(target.dataset.rebaseIndex ?? -1), action: target.dataset.rebaseAction as Action }
      : null;
  };
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    onBlur?.(event);
    const to = event.relatedTarget;
    // The focus went somewhere on purpose (another element, or nowhere while the button is still there).
    if ((to instanceof Node && !stripRef.current?.contains(to)) || (to === null && event.target.isConnected)) focused.current = null;
  };

  useIsomorphicLayoutEffect(() => {
    const last = focused.current;
    if (!last || last.element.isConnected) return;
    focused.current = null;
    const doc = last.element.ownerDocument;
    if (!isLost(doc)) return; // the callback moved the focus itself
    const strip = stripRef.current;
    const button = (index: number, action: Action) =>
      strip?.querySelector<HTMLElement>(`[data-rebase-index="${index}"][data-rebase-action="${action}"]`) ?? null;
    let target: HTMLElement | null = null;
    if (last.action !== 'all' && conflicts.length > 0) {
      target = button(Math.min(last.index, conflicts.length - 1), last.action);
    }
    if (!target && cameFrom.current?.isConnected) target = cameFrom.current;
    if (!target && strip) target = strip;
    target?.focus({ preventScroll: true });
  });

  /* ---------------------------------------------------------------------------------------------- */
  /* Rendering.                                                                                      */
  /* ---------------------------------------------------------------------------------------------- */
  const valueNode = (value: unknown, entry: ChangeEntry, shown: string): ReactNode =>
    renderValue ? (
      renderValue(value, entry)
    ) : (
      <span className={cn('rop-pro-change-summary__value', isMutedValue(value) && 'rop-pro-change-summary__value--muted')}>{shown}</span>
    );

  const side = (conflict: RebaseConflict, entry: ChangeEntry, which: 'mine' | 'theirs', shown: string) => {
    const missing = which === 'mine' ? conflict.mineMissing : conflict.theirsMissing;
    const value = which === 'mine' ? conflict.mine : conflict.theirs;
    return (
      <span className={`${RN}__side`}>
        <span className={`${RN}__side-label`}>{`${which === 'mine' ? labels.mine : labels.theirs}:`}</span>{' '}
        {missing ? <span className="rop-pro-change-summary__value rop-pro-change-summary__value--muted">{labels.missing}</span> : valueNode(value, entry, shown)}
      </span>
    );
  };

  const texts = (conflict: RebaseConflict): [string, string] => {
    const one = (value: unknown, missing: boolean, level: 0 | 1 | 2 | 3) =>
      missing ? labels.missing : formatChangeValueAt(value, format, level);
    return distinctValueTexts(
      (which, level) => (which === 0 ? one(conflict.mine, conflict.mineMissing, level) : one(conflict.theirs, conflict.theirsMissing, level)),
      labels.contentsDiffer,
    );
  };

  // Keys: the path, plus its occurrence when two conflicts share one (an item removed by each side).
  const seen = new Map<string, number>();
  const keyOf = (path: string) => {
    const n = seen.get(path) ?? 0;
    seen.set(path, n + 1);
    return n === 0 ? path : `${path}#${n}`;
  };

  return (
    <>
      <span ref={liveRef} role="status" className={`${RN}__live`}>
        {announcement}
      </span>
      {visible ? (
        <MessageStrip
          {...rest}
          ref={stripRefs}
          tone={conflicts.length > 0 ? 'warning' : 'info'}
          // Announced by the region above, once per update: the strip itself is not live.
          live={false}
          title={labels.title}
          // Focusable from script only: where the focus goes when nothing else of the notice is left.
          tabIndex={-1}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn(RN, className)}
        >
          {pending ? <p className={`${RN}__text`}>{labels.pending}</p> : null}
          {applied.length > 0 ? <p className={`${RN}__text`}>{labels.applied(applied.length)}</p> : null}
          {conflicts.length > 0 ? (
            <>
              <p className={`${RN}__text`}>{labels.conflicts(conflicts.length)}</p>
              <ul aria-label={labels.conflictList} className={`${RN}__list`}>
                {conflicts.map((conflict, index) => {
                  const entry = toEntry(conflict);
                  const [mineText, theirsText] = renderValue ? ['', ''] : texts(conflict);
                  return (
                    // The `{' '}` between the flex items render nothing (white space between flex items is not laid
                    // out) but keep the words apart in the text of the item (`Due date Yours: … Server: …`).
                    <li key={keyOf(conflict.path)} className={`${RN}__item`}>
                      <span className={`${RN}__label`}>{conflict.label}</span>{' '}
                      <span className={`${RN}__values`}>
                        {side(conflict, entry, 'mine', mineText)}{' '}
                        {side(conflict, entry, 'theirs', theirsText)}
                      </span>{' '}
                      <span className={`${RN}__actions`}>
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={labels.acceptTheirsFor(conflict.label)}
                          data-rebase-index={index}
                          data-rebase-action="theirs"
                          onClick={() => onAcceptTheirs(conflict.path)}
                        >
                          {labels.acceptTheirs}
                        </Button>{' '}
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={labels.keepMineFor(conflict.label)}
                          data-rebase-index={index}
                          data-rebase-action="mine"
                          onClick={() => onKeepMine(conflict.path)}
                        >
                          {labels.keepMine}
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {conflicts.length > 1 ? (
                <span className={`${RN}__actions`}>
                  <Button size="sm" variant="secondary" data-rebase-action="all" onClick={onAcceptAllTheirs}>
                    {labels.acceptAllTheirs}
                  </Button>
                </span>
              ) : null}
            </>
          ) : null}
        </MessageStrip>
      ) : null}
    </>
  );
});
