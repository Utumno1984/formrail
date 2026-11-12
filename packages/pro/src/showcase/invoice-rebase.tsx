// Story-only (#384), not part of @formrail/pro: the "record updated on the server while you edit it" step of the
// Pro story `Pro/Showcase/Invoices with Change Summary`, plugged into the Free CRUD showcase through its
// `useAddons` extension point. `useFormRebase` merges every server version the store announces into the open
// editor, `RebaseNotice` shows the result under the header, a Field in conflict says so, and the "Review changes"
// dialog of #377 names the server changes a save would overwrite.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button, MessageStrip } from '@formrail/core';
import type {
  InvoiceEditorAddonContext,
  InvoiceEditorAddons,
  InvoiceFormValues,
  InvoiceSaveReviewContext,
  UseInvoiceEditorAddons,
} from '../../../core/src/showcase/InvoiceRecordPage';
import type { ServerChange, StoredInvoice } from '../../../core/src/showcase/invoice-store';
import { ChangeSummary } from '../change-summary/ChangeSummary';
import { RebaseNotice } from '../form-rebase/RebaseNotice';
import type { OpenRebaseConflict, RebaseConflict } from '../form-rebase/types';
import { useFormRebase } from '../form-rebase/use-form-rebase';
import {
  INVOICE_REVIEW_ARRAY_ID_KEYS,
  INVOICE_REVIEW_PATH_LABELS,
  ORDER_ALSO_NOTE,
  ORDER_ONLY_DESCRIPTION,
  REVIEW_LOCALE,
  invoiceReviewEntries,
  invoiceReviewIsEqual,
  lineOrderChanged,
  renderInvoiceReviewValue,
  reviewDescription,
  invoiceSaveReview,
} from './invoice-review';

/** What "Simulate server update" changes on the stored invoice (another user's edit). */
export type ServerChangeKind = 'status-and-due-date' | 'status' | 'due-date' | 'line-1-quantity' | 'remove-line-1' | 'delete-invoice';

export const SERVER_CHANGE_KINDS: readonly ServerChangeKind[] = [
  'status-and-due-date',
  'status',
  'due-date',
  'line-1-quantity',
  'remove-line-1',
  'delete-invoice',
];

export interface InvoiceRebaseOptions {
  /** What the simulated update changes. */
  serverChange: ServerChangeKind;
  /** How long the simulated update takes to reach the server after the click (ms). */
  serverUpdateDelayMs: number;
  /** Shows "Simulate server update" in the header. */
  simulateServerUpdate: boolean;
  /** Called with every change of the open invoice the server announces (Storybook Actions). */
  onServerChange?: (change: ServerChange) => void;
}

const NEXT_STATUS: Record<StoredInvoice['status'], StoredInvoice['status']> = {
  pending: 'approved',
  approved: 'rejected',
  rejected: 'pending',
};

const DAY_MS = 86_400_000;
const laterBy = (iso: string, days: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The change of another user, as a function of the record the server holds when it lands. */
export function serverChangeOf(kind: Exclude<ServerChangeKind, 'delete-invoice'>): (record: StoredInvoice) => StoredInvoice {
  switch (kind) {
    case 'status':
      return (r) => ({ ...r, status: NEXT_STATUS[r.status] });
    case 'due-date':
      return (r) => ({ ...r, dueDate: laterBy(r.dueDate, 7) });
    case 'line-1-quantity':
      return (r) => ({ ...r, lineItems: r.lineItems.map((line, i) => (i === 0 ? { ...line, quantity: line.quantity + 1 } : line)) });
    case 'remove-line-1':
      return (r) => ({ ...r, lineItems: r.lineItems.slice(1) });
    default:
      return (r) => ({ ...r, status: NEXT_STATUS[r.status], dueDate: laterBy(r.dueDate, 7) });
  }
}

export const NOTICE_TITLE = 'This invoice was updated while you were editing.';
export const CONFLICT_HELP = 'Changed on the server too.';
export const REMOVED_HELP = 'Removed on the server.';
export const DELETED_TITLE = 'This invoice was deleted on the server';
export const DELETED_TEXT = 'Your changes can no longer be saved. Go back to the list.';
export const OVERWRITE_TITLE = 'You are overwriting a server change';

/** The notice sits above the page (outside its padded scroller): the same side margins as the page's content. */
const NOTICE_MARGIN = { margin: '12px 16px' } as const;

const LINE_ROW = /^lineItems\.(\d+)(?=\.|$)/;

/**
 * `Line items > Item 2` alone is ambiguous (see `nameLine` in invoice-review.tsx): the row's description is added.
 * The row is the one at the conflict's CURRENT position (`currentPath`, found again by id after the user moved,
 * removed or added lines), never the index of the rebase; a row the user removed is read from the server's
 * version (the baseline), at the server's index. Built on `labelPath` (one label per segment), never on a split
 * of `label`.
 */
function nameConflict(conflict: OpenRebaseConflict, values: InvoiceFormValues, baseline: InvoiceFormValues): OpenRebaseConflict {
  const match = LINE_ROW.exec(conflict.currentPath);
  if (!match || conflict.labelPath[1] === undefined) return conflict;
  const rows = conflict.mineMissing ? baseline.lineItems : values.lineItems;
  const description = rows[Number(match[1])]?.description.trim();
  if (!description) return conflict;
  const labelPath = conflict.labelPath.map((segment, i) =>
    i === 1 ? `${segment} (${description.replaceAll('(', '[').replaceAll(')', ']')})` : segment,
  );
  return { ...conflict, labelPath, label: labelPath.join(' > ') };
}

/** The state the review dialog reads while it is open: it follows a server update that lands under it. */
interface ReviewState {
  context: InvoiceSaveReviewContext;
  conflicts: OpenRebaseConflict[];
}

function createReviewSource(initial: ReviewState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: ReviewState) => {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type ReviewSource = ReturnType<typeof createReviewSource>;

function useReview(source: ReviewSource) {
  return useSyncExternalStore(source.subscribe, source.get, source.get);
}

/** The description of the review, recomputed when the form changes under the dialog. */
function ReviewDescription({ source }: { source: ReviewSource }) {
  const { context } = useReview(source);
  const entries = invoiceReviewEntries(context);
  if (entries.length > 0) return <>{reviewDescription(entries.length)}</>;
  return <>{lineOrderChanged(context.values, context.baseline) ? ORDER_ONLY_DESCRIPTION : 'Nothing left to save.'}</>;
}

/** The body of the review: the conflicts the save would overwrite, then the changes (as in #377). */
function ReviewBody({ source }: { source: ReviewSource }) {
  const { context, conflicts } = useReview(source);
  const entries = invoiceReviewEntries(context);
  const reordered = lineOrderChanged(context.values, context.baseline);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {conflicts.length > 0 ? (
        <MessageStrip tone="warning" live={false} title={OVERWRITE_TITLE}>
          <ul aria-label="Server changes you overwrite" style={{ margin: 0, paddingInlineStart: 20 }}>
            {conflicts.map((conflict) => (
              <li key={conflict.path}>{conflict.label}</li>
            ))}
          </ul>
        </MessageStrip>
      ) : null}
      {entries.length > 0 ? (
        <ChangeSummary entries={entries} label="Changes to save" locale={REVIEW_LOCALE} timeZone="UTC" renderValue={renderInvoiceReviewValue} />
      ) : null}
      {reordered && entries.length > 0 ? <p style={{ margin: 0 }}>{ORDER_ALSO_NOTE}</p> : null}
    </div>
  );
}

/**
 * The hook plugged into the editor (`useAddons`). It never changes the order of its hooks: the editor calls it at
 * every render of an existing invoice.
 */
export function useInvoiceRebase({ form, record, store, toValues, scrollerRef }: InvoiceEditorAddonContext, options: InvoiceRebaseOptions): InvoiceEditorAddons {
  const rebase = useFormRebase(form, {
    arrayIdKeys: INVOICE_REVIEW_ARRAY_ID_KEYS,
    labels: INVOICE_REVIEW_PATH_LABELS,
    isEqual: invoiceReviewIsEqual,
  });
  const [deleted, setDeleted] = useState(false);
  const optionsRef = useRef(options);
  const latest = useRef({ rebase: rebase.rebase, toValues });
  useEffect(() => {
    optionsRef.current = options;
    latest.current = { rebase: rebase.rebase, toValues };
  });

  // Every version of THIS invoice the server announces is merged into the editor (queued during a save).
  useEffect(
    () =>
      store.subscribe((change) => {
        if (change.id !== record.id) return;
        optionsRef.current.onServerChange?.(change);
        if (change.record === null) setDeleted(true);
        else latest.current.rebase(latest.current.toValues(change.record));
      }),
    [store, record.id],
  );

  const simulate = useCallback(() => {
    const { serverChange, serverUpdateDelayMs } = optionsRef.current;
    // A record already gone rejects with "not found": the deletion was announced already.
    const ignore = () => undefined;
    if (serverChange === 'delete-invoice') void store.removeFromServer(record.id, serverUpdateDelayMs).catch(ignore);
    else void store.updateFromServer(record.id, serverChangeOf(serverChange), serverUpdateDelayMs).catch(ignore);
  }, [store, record.id]);

  const conflicts = rebase.conflicts.map((conflict) => nameConflict(conflict, form.values, form.baseline));

  // The review dialog reads the form through this source while it is open (#384: an update may land under it).
  const [review] = useState(() => createReviewSource({ context: { values: form.values, baseline: form.baseline }, conflicts }));
  useEffect(() => {
    const current = review.get();
    if (current.context.values === form.values && current.context.baseline === form.baseline && sameConflicts(current.conflicts, conflicts)) return;
    review.set({ context: { values: form.values, baseline: form.baseline }, conflicts });
  });

  const reviewSave = useCallback(
    (context: InvoiceSaveReviewContext) => {
      const base = invoiceSaveReview(context);
      const open = review.get().conflicts;
      if (!base && open.length === 0) return null;
      review.set({ context, conflicts: open });
      return {
        title: 'Review changes',
        confirmLabel: 'Save changes',
        cancelLabel: 'Keep editing',
        tone: 'default' as const,
        initialFocus: 'cancel' as const,
        description: <ReviewDescription source={review} />,
        children: <ReviewBody source={review} />,
      };
    },
    [review],
  );

  const fieldHelp = (path: string): ReactNode => {
    for (const conflict of conflicts) {
      // The field at the conflict's current position (its row may have moved since the rebase).
      if (path === conflict.currentPath || path.startsWith(`${conflict.currentPath}.`)) return conflict.theirsMissing ? REMOVED_HELP : CONFLICT_HELP;
    }
    return undefined;
  };

  const notice = (
    <>
      {deleted ? (
        <MessageStrip tone="error" title={DELETED_TITLE} style={NOTICE_MARGIN}>
          {DELETED_TEXT}
        </MessageStrip>
      ) : null}
      <RebaseNotice
        applied={rebase.applied}
        conflicts={conflicts}
        pending={rebase.isPending}
        onAcceptTheirs={rebase.acceptTheirs}
        onKeepMine={rebase.keepMine}
        onAcceptAllTheirs={rebase.acceptAllTheirs}
        labels={{ title: NOTICE_TITLE }}
        focusTargetFor={fieldOf}
        // Above the page's scroller, outside it: the content in view does not move when it appears or goes away.
        scrollContainerRef={scrollerRef}
        style={NOTICE_MARGIN}
        renderValue={renderInvoiceReviewValue}
        locale={REVIEW_LOCALE}
        timeZone="UTC"
      />
    </>
  );

  return {
    notice,
    actions: options.simulateServerUpdate ? (
      <Button variant="secondary" onClick={simulate} aria-disabled={deleted || undefined}>
        Simulate server update
      </Button>
    ) : null,
    fieldHelp,
    reviewSave,
  };
}

/**
 * The control of the field a conflict was about, at its current position (`data-rop-name` is the Field's `name`);
 * for a whole line, its first field. `null` when it is not on the page (a line the server removed and the user
 * accepted to remove).
 */
function fieldOf(conflict: RebaseConflict): HTMLElement | null {
  const path = 'currentPath' in conflict && typeof conflict.currentPath === 'string' ? conflict.currentPath : conflict.path;
  const name = CSS.escape(path);
  return document.querySelector<HTMLElement>(`[data-rop-name="${name}"]`) ?? document.querySelector<HTMLElement>(`[data-rop-name^="${name}."]`);
}

const sameConflicts = (a: readonly OpenRebaseConflict[], b: readonly OpenRebaseConflict[]): boolean =>
  a.length === b.length && a.every((c, i) => c.path === b[i]?.path && c.label === b[i]?.label);

/** The `useAddons` of the story: one hook per mount, reading the latest story args. */
export function invoiceRebaseAddons(options: { readonly current: InvoiceRebaseOptions }): UseInvoiceEditorAddons {
  return function useInvoiceRebaseAddons(context) {
    return useInvoiceRebase(context, options.current);
  };
}
