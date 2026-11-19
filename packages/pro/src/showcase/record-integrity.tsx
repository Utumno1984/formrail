// Story-only (#524), not part of @formrail/pro: what the "record editing integrity" add-ons of EVERY module of
// `Pro/Showcase/Record editing integrity` share (sales orders: sales-order-review.tsx and sales-order-rebase.tsx;
// customers: customer-review.tsx and customer-rebase.tsx). None of it names or compares a field: that is the engine's
// (`computeChangeSummaryResult`, `useFormRebase`) with each module's options. Here: how "no value" reads, a top-level
// field with no value on one side, the wrapper of a value, the counts of the review, and the state the open review
// dialog reads while a server update lands under it.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { MessageStrip } from '@formrail/core';
import { DEFAULT_VALUE_LABELS } from '../change-summary/format-change-value';
import type { ChangeEntry } from '../change-summary/types';
import type { OpenRebaseConflict } from '../form-rebase/types';

/** Fixed in the story, so the texts (and the visual baselines) do not depend on the machine. */
export const REVIEW_LOCALE = 'en-US';

/**
 * "No value" in its three forms, told apart (spec §1.13.1): `''` is `Empty`, `null` is `Null`, `undefined` is
 * `Missing` when the entry says that side has no key, else `Undefined`. The side being rendered is the one whose
 * value is `undefined`; when BOTH sides are `undefined` (a key present with `undefined` against a missing one) the
 * two calls get the same arguments and cannot be told apart (the declared limit of `renderValue`, §1.13.1 point 4).
 */
export function absentText(value: '' | null | undefined, entry: ChangeEntry): string {
  if (value === '') return DEFAULT_VALUE_LABELS.empty;
  if (value === null) return DEFAULT_VALUE_LABELS.nullValue;
  const missing =
    entry.before === undefined && entry.after !== undefined
      ? entry.beforeMissing
      : entry.after === undefined && entry.before !== undefined
        ? entry.afterMissing
        : false;
  return missing ? DEFAULT_VALUE_LABELS.missingValue : DEFAULT_VALUE_LABELS.undefinedValue;
}

/**
 * A field of the record (a top-level key, never a row nor a nested part) with no value on one side: the engine
 * reports it as `added` or `removed`, which shows only the side that has a value and normalizes a `null` to
 * `undefined`. A field is not added to a record nor removed from it, and `''`, `null` and a missing key must read
 * differently (spec §1.13.1: a backend tells "cleared" from "not sent"). So it reads as a change from or to that
 * absence, with both sides taken from the two records as they are: `Notes, changed, from Null to Call first.`,
 * `from Missing to ...`. Same path, label and count of entries: only the kind and the absent side change. A nested
 * path (`lines.2`, `contacts.1`, `billingAddress.line2`) keeps its kind.
 */
export function fieldAsChange<V extends object>(entry: ChangeEntry, values: V, baseline: V): ChangeEntry {
  if (entry.kind === 'changed' || entry.path.includes('.')) return entry;
  const key = entry.path as keyof V;
  return {
    ...entry,
    kind: 'changed',
    before: baseline[key],
    after: values[key],
    beforeMissing: !Object.hasOwn(baseline, key),
    afterMissing: !Object.hasOwn(values, key),
  };
}

/** A value of `ChangeSummary` and `RebaseNotice` in the wrapper their default rendering uses (wrapping, the muted look of no value). */
export function reviewValue(value: unknown, text: string): ReactNode {
  const muted = value === '' || value === null || value === undefined;
  return <span className={muted ? 'rop-pro-change-summary__value rop-pro-change-summary__value--muted' : 'rop-pro-change-summary__value'}>{text}</span>;
}

/** `1 change will be saved.`, `3 changes will be saved.` */
export const reviewDescription = (n: number): string => (n === 1 ? '1 change will be saved.' : `${n} changes will be saved.`);

export const NOTHING_LEFT_DESCRIPTION = 'Nothing left to save.';
export const OVERWRITE_TITLE = 'You are overwriting a server change';

/**
 * The state the review dialog reads while it is open (a server update may land under it): a tiny external store,
 * read with `useSyncExternalStore`, so the dialog's description and body follow it without a new `confirm()`.
 */
export function createReviewSource<S>(initial: S) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: S) => {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
export type ReviewSource<S> = ReturnType<typeof createReviewSource<S>>;

export function useReview<S>(source: ReviewSource<S>): S {
  return useSyncExternalStore(source.subscribe, source.get, source.get);
}

/** Out of view, still read by assistive technology (the same box as the shell's own announcer). */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

/**
 * #583: the live region of the open review dialog. The dialog's description (`aria-describedby`) is read when the
 * dialog opens, but not when it changes under it (a server update lands, the record is deleted): this region, a
 * polite `status` mounted EMPTY with the dialog's body, then says the new `text`. Once per text: a render with the
 * same text (another change of the body, a second announcement of the same server version) leaves the region as it is,
 * so a screen reader does not read it again; the opening text is never put in it (the dialog has just read it). Only
 * the text of the description: never the page's own alert (deleted, updated), which says something else.
 */
export function ReviewAnnouncer({ text }: { text: string }) {
  const [announced, setAnnounced] = useState('');
  const last = useRef(text);
  useEffect(() => {
    if (text === last.current) return;
    last.current = text;
    setAnnounced(text);
  }, [text]);
  return (
    <div role="status" data-review-announcer="" style={VISUALLY_HIDDEN}>
      {announced}
    </div>
  );
}

/** Same open conflicts, in the same order, with the same labels (the review source is set only when they change). */
export const sameConflicts = (a: readonly OpenRebaseConflict[], b: readonly OpenRebaseConflict[]): boolean =>
  a.length === b.length && a.every((c, i) => c.path === b[i]?.path && c.label === b[i]?.label);

/** At the top of the review: the server changes a save would overwrite (the open conflicts), by label. */
export function OverwrittenChanges({ conflicts }: { conflicts: readonly OpenRebaseConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <MessageStrip tone="warning" live={false} title={OVERWRITE_TITLE}>
      <ul aria-label="Server changes you overwrite" style={{ margin: 0, paddingInlineStart: 20 }}>
        {conflicts.map((conflict) => (
          <li key={conflict.path}>{conflict.label}</li>
        ))}
      </ul>
    </MessageStrip>
  );
}
