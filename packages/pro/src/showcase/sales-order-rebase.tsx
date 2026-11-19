// Story-only (#522), not part of @formrail/pro: the "order updated on the server while you edit it" step of
// `Pro/Showcase/Record editing integrity`, plugged into the Free record-editing shell through the per-module
// `useAddons` add-on (#519). `useFormRebase` merges every server version the store announces into the open editor,
// `RebaseNotice` shows the result above the page, a Field in conflict says so, and the "Review changes" dialog names
// the server changes a save would overwrite. The rows of a conflict are named by the engine (`itemLabel`, #534).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, MessageStrip } from '@formrail/core';
import { addDays } from '../../../core/src/calendar/date-math';
import { DEMO_REFERENCE_POOL, makeProducts, type DemoSalesOrderStatus } from '../../../core/src/internal/demo-data';
import type { SalesOrderValues } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';
import type { RecordEditorAddonContext, RecordEditorAddons, RecordSaveReview, UseRecordEditorAddons } from '../../../core/src/showcase/RecordPageShell';
import type { RecordServerChange } from '../../../core/src/showcase/record-store';
import type { SalesOrderDraft, StoredOrderLine, StoredSalesOrder } from '../../../core/src/showcase/sales-order-store';
import { RebaseNotice } from '../form-rebase/RebaseNotice';
import type { OpenRebaseConflict, RebaseConflict } from '../form-rebase/types';
import { useFormRebase } from '../form-rebase/use-form-rebase';
import {
  NOTHING_LEFT_DESCRIPTION,
  OverwrittenChanges,
  REVIEW_LOCALE,
  ReviewAnnouncer,
  createReviewSource,
  reviewDescription,
  sameConflicts,
  useReview,
  type ReviewSource,
} from './record-integrity';
import {
  ORDER_ALSO_NOTE,
  ORDER_ONLY_DESCRIPTION,
  SALES_ORDER_ARRAY_ID_KEYS,
  SALES_ORDER_LABELS,
  SalesOrderChanges,
  salesOrderEngine,
  salesOrderLineLabel,
  salesOrderReview,
  salesOrderSaveReview,
  type SalesOrderReviewContext,
} from './sales-order-review';

/** What "Simulate server update" does to the stored order (another user's edit). */
export type SalesOrderServerChangeKind = 'status-and-delivery' | 'line-1-quantity' | 'remove-line-1' | 'add-line' | 'delete-order';

export const SALES_ORDER_SERVER_CHANGES: readonly SalesOrderServerChangeKind[] = [
  'status-and-delivery',
  'line-1-quantity',
  'remove-line-1',
  'add-line',
  'delete-order',
];

export interface SalesOrderRebaseOptions {
  /** What the simulated update changes. */
  serverChange: SalesOrderServerChangeKind;
  /** How long the simulated update takes to reach the server after the click (ms). */
  serverUpdateDelayMs: number;
  /** Shows "Simulate server update" in the header. */
  simulateServerUpdate: boolean;
  /** Called with every change of the open order the server announces (Storybook Actions). */
  onServerChange?: ((change: RecordServerChange<StoredSalesOrder>) => void) | undefined;
}

type SalesOrderAddonContext = RecordEditorAddonContext<StoredSalesOrder, SalesOrderValues, SalesOrderDraft>;
type UseSalesOrderAddons = UseRecordEditorAddons<StoredSalesOrder, SalesOrderValues, SalesOrderDraft>;

/**
 * The next status another user gives an order: one step forward, an invoiced order back to shipped. Never
 * `cancelled`, and a cancelled order stays cancelled (it is closed: only its delivery date moves), so a simulated
 * update never turns the page read-only under the user.
 */
export const NEXT_STATUS: Readonly<Record<DemoSalesOrderStatus, DemoSalesOrderStatus>> = {
  draft: 'confirmed',
  confirmed: 'shipped',
  shipped: 'invoiced',
  invoiced: 'shipped',
  cancelled: 'cancelled',
};

/** Days the other user moves the requested delivery by. */
export const DELIVERY_SHIFT_DAYS = 7;

/** A product the other user adds: the first active one of the catalogue that the order does not have yet. */
function productToAdd(order: StoredSalesOrder) {
  const present = new Set(order.lines.map((line) => line.productId));
  const product = makeProducts(DEMO_REFERENCE_POOL.products).find((p) => p.status === 'active' && !present.has(p.id));
  if (!product) throw new Error(`sales-order-rebase: no product left to add to ${order.id}`);
  return product;
}

/**
 * The change of another user, as a function of the order the server holds when it lands. `newLineId` gives the id of
 * the line `add-line` adds: an id the server issues (see {@link serverLineIds}), so it never collides with a line the
 * user added in the editor and has not saved yet (`new-<n>`, made by the client).
 *
 * Idempotent (#583): the FIRST call fixes what the other user wrote, from the order it gets (the server's when the
 * update lands): the next status and the delivery a week later, the quantity of the first line plus one, which line is
 * removed (by id), the line added (its product and its id). A later call writes those same values, whatever order it
 * gets: when the update lands during a save, the store applies it again on top of what the save wrote, and the result
 * is what the server announced, never a value computed from the user's (their delivery plus a week, another product
 * under the same `srv-line-<n>`, a second line added). Lines are found by id, never by position. One call of this
 * function is one update: two clicks on "Simulate server update" are two updates, each from the order of its time.
 */
export function serverChangeOf(
  kind: Exclude<SalesOrderServerChangeKind, 'delete-order'>,
  newLineId: () => string = () => {
    throw new Error('sales-order-rebase: `add-line` needs a line id');
  },
): (order: StoredSalesOrder) => StoredSalesOrder {
  let write: ((order: StoredSalesOrder) => StoredSalesOrder) | undefined;
  return (order) => {
    write ??= writeOf(kind, order, newLineId);
    return write(order);
  };
}

const unchanged = (order: StoredSalesOrder): StoredSalesOrder => order;

/** What the other user writes, fixed from `first` (the order the update landed on), as a function of any order. */
function writeOf(
  kind: Exclude<SalesOrderServerChangeKind, 'delete-order'>,
  first: StoredSalesOrder,
  newLineId: () => string,
): (order: StoredSalesOrder) => StoredSalesOrder {
  switch (kind) {
    case 'line-1-quantity': {
      const target = first.lines[0];
      if (!target) return unchanged;
      const quantity = target.quantity + 1;
      return (o) => ({ ...o, lines: o.lines.map((line) => (line.id === target.id ? { ...line, quantity } : line)) });
    }
    case 'remove-line-1': {
      const target = first.lines[0];
      if (!target) return unchanged;
      return (o) => ({ ...o, lines: o.lines.filter((line) => line.id !== target.id) });
    }
    case 'add-line': {
      const product = productToAdd(first);
      const added: StoredOrderLine = { id: newLineId(), productId: product.id, quantity: 1, unitPriceMinor: product.listPriceMinor[first.currency], discountPercent: 0 };
      return (o) => (o.lines.some((line) => line.id === added.id) ? o : { ...o, lines: [...o.lines, { ...added }] });
    }
    default: {
      const status = NEXT_STATUS[first.status];
      const requestedDeliveryDate = addDays(first.requestedDeliveryDate, DELIVERY_SHIFT_DAYS) ?? first.requestedDeliveryDate;
      return (o) => ({ ...o, status, requestedDeliveryDate });
    }
  }
}

const issued = new WeakMap<object, number>();

/**
 * The ids the "server" gives the lines it adds, one sequence per store (per mount of the story): `srv-line-1`,
 * `srv-line-2`, ... never issued twice, also after the line is removed. Another prefix than the client's `new-<n>`
 * (`nextLineId` of the Sales orders module): a line added on the server and a line added in the open editor never
 * share an id, so the merge never takes them for one line.
 */
export function serverLineIds(store: object): () => string {
  return () => {
    const n = (issued.get(store) ?? 0) + 1;
    issued.set(store, n);
    return `srv-line-${n}`;
  };
}

export const NOTICE_TITLE = 'This sales order was updated while you were editing.';
export const CONFLICT_HELP = 'Changed on the server too.';
export const REMOVED_HELP = 'Removed on the server.';
export const DELETED_TITLE = 'This sales order was deleted on the server';
export const DELETED_TEXT = 'Your changes are still in the form, but they can no longer be saved. Copy what you need, then go back to the list.';
export const DELETED_REVIEW_DESCRIPTION = 'This sales order was deleted on the server: these changes can no longer be saved.';
/**
 * #583: why "Save changes" of the review cannot be used once the order is deleted on the server (the reason the button
 * is described by). Short, about the button: the dialog's description already says what happened to the changes.
 */
export const DELETED_SAVE_REASON = 'Unavailable: this sales order no longer exists on the server.';
export { OVERWRITE_TITLE } from './record-integrity';

/** The notice sits above the page (outside its padded scroller): the same side margins as the page's content. */
const NOTICE_MARGIN = { margin: '12px 16px' } as const;

/** The state the review dialog reads while it is open: it follows a server update that lands under it. */
interface ReviewState {
  context: SalesOrderReviewContext;
  conflicts: OpenRebaseConflict[];
  /** The order was deleted on the server: what the review lists can no longer be saved. */
  deleted: boolean;
}

/** The text of the review's description, for the state the dialog reads (#583: also what its live region says). */
export function reviewDescriptionText({ context, deleted }: Pick<ReviewState, 'context' | 'deleted'>): string {
  if (deleted) return DELETED_REVIEW_DESCRIPTION;
  const { entries, reorders } = salesOrderReview(context);
  if (entries.length > 0) return reviewDescription(entries.length);
  return reorders.length > 0 ? ORDER_ONLY_DESCRIPTION : NOTHING_LEFT_DESCRIPTION;
}

/** The description of the review, recomputed when the form changes under the dialog. */
function ReviewDescription({ source }: { source: ReviewSource<ReviewState> }) {
  return <>{reviewDescriptionText(useReview(source))}</>;
}

/**
 * The body of the review: the server changes the save would overwrite, then the changes to save; first, the live
 * region that says the new description when it changes while the dialog is open (#583).
 */
function ReviewBody({ source }: { source: ReviewSource<ReviewState> }) {
  const state = useReview(source);
  const { context, conflicts } = state;
  const { entries, reorders } = salesOrderReview(context);
  return (
    <>
      <ReviewAnnouncer text={reviewDescriptionText(state)} />
      <div style={{ display: 'grid', gap: 12 }}>
        <OverwrittenChanges conflicts={conflicts} />
        {entries.length > 0 ? <SalesOrderChanges entries={entries} currency={context.baseline.currency} /> : null}
        {reorders.length > 0 && entries.length > 0 ? <p style={{ margin: 0 }}>{ORDER_ALSO_NOTE}</p> : null}
      </div>
    </>
  );
}

/**
 * The hook plugged into the editor (`useAddons`). It never changes the order of its hooks: the editor calls it at
 * every render of an existing order.
 */
export function useSalesOrderRebase({ form, record, store, toValues, scrollerRef }: SalesOrderAddonContext, options: SalesOrderRebaseOptions): RecordEditorAddons<SalesOrderValues> {
  // The currency of an existing order is its customer's and never changes: one engine (stable identity) for the page.
  const engine = salesOrderEngine(form.baseline.currency);
  const rebase = useFormRebase(form, {
    arrayIdKeys: SALES_ORDER_ARRAY_ID_KEYS,
    labels: SALES_ORDER_LABELS,
    isEqual: engine.isEqual,
    itemLabel: salesOrderLineLabel,
  });
  const [deleted, setDeleted] = useState(false);
  const optionsRef = useRef(options);
  const latest = useRef({ rebase: rebase.rebase, toValues });
  useEffect(() => {
    optionsRef.current = options;
    latest.current = { rebase: rebase.rebase, toValues };
  });

  // Every version of THIS order the server announces is merged into the editor (queued during a save).
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

  const [newLineId] = useState(() => serverLineIds(store));
  const simulate = useCallback(() => {
    const { serverChange, serverUpdateDelayMs } = optionsRef.current;
    // An order already gone rejects with "not found": the deletion was announced already.
    const ignore = () => undefined;
    if (serverChange === 'delete-order') void store.removeFromServer(record.id, serverUpdateDelayMs).catch(ignore);
    else {
      // One id per click: the store replays the change on top of a save in flight, and the replay must give the same id.
      const lineId = serverChange === 'add-line' ? newLineId() : '';
      void store.updateFromServer(record.id, serverChangeOf(serverChange, () => lineId), serverUpdateDelayMs).catch(ignore);
    }
  }, [store, record.id, newLineId]);

  const { conflicts } = rebase;

  // The review dialog reads the form through this source while it is open: an update may land under it.
  const [review] = useState(() => createReviewSource<ReviewState>({ context: { values: form.values, baseline: form.baseline }, conflicts, deleted }));
  useEffect(() => {
    const current = review.get();
    if (current.context.values === form.values && current.context.baseline === form.baseline && sameConflicts(current.conflicts, conflicts) && current.deleted === deleted) return;
    review.set({ context: { values: form.values, baseline: form.baseline }, conflicts, deleted });
  });

  const reviewSave = useCallback(
    (context: SalesOrderReviewContext): RecordSaveReview | null => {
      const base = salesOrderSaveReview(context);
      const open = review.get().conflicts;
      if (!base && open.length === 0) return null;
      review.set({ context, conflicts: open, deleted: review.get().deleted });
      return {
        title: 'Review changes',
        confirmLabel: 'Save changes',
        cancelLabel: 'Keep editing',
        tone: 'default',
        initialFocus: 'cancel',
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
        renderValue={engine.renderValue}
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
    // #583: one source, the deletion the store announced, whenever it landed: before Save was pressed (the review
    // opens with "Save changes" unavailable) or while the review is open (the button turns unavailable under it).
    // Read by the shell at every render, so both reach the dialog the same way; never a "not found" from a save.
    confirmDisabledReason: deleted ? DELETED_SAVE_REASON : undefined,
  };
}

/** The control of a form path (`data-rop-name` is the Field's `name`); for a whole line, its first field (the product). */
const controlOf = (path: string): HTMLElement | null => {
  const name = CSS.escape(path);
  return document.querySelector<HTMLElement>(`[data-rop-name="${name}"]`) ?? document.querySelector<HTMLElement>(`[data-rop-name^="${name}."]`);
};

/**
 * `focusTargetFor` of the notice: where the focus goes when a choice closes the last conflict. The control of the
 * field the conflict was about, at its current position (`currentPath`, read when the choice was made); for a whole
 * line, its product.
 *
 * A line the server removed, after "Use server value": that line is gone, and `currentPath` (say `lines.0`) now names
 * the line that took its place. So the focus goes to the product of the NEXT line (the one that moved up into that
 * position), else of the previous one (the removed line was the last), else to "Add line" (no line left; its
 * `data-rop-name` is `lines`). The same order as the editor's own "Remove line": the focus never lands on `<body>`.
 */
function fieldOf(conflict: RebaseConflict): HTMLElement | null {
  const path = 'currentPath' in conflict && typeof conflict.currentPath === 'string' ? conflict.currentPath : conflict.path;
  const own = controlOf(path);
  if (own) return own;
  const [head, row] = path.split('.');
  if (head !== 'lines' || row === undefined) return null;
  for (let index = Number(row) - 1; index >= 0; index -= 1) {
    const previous = controlOf(`lines.${index}`);
    if (previous) return previous;
  }
  return controlOf('lines');
}

/** The `useAddons` of the story: one hook per mount, reading the latest story args. */
export function salesOrderRebaseAddons(options: { readonly current: SalesOrderRebaseOptions }): UseSalesOrderAddons {
  return function useSalesOrderRebaseAddons(context) {
    return useSalesOrderRebase(context, options.current);
  };
}
