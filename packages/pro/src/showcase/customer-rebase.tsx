// Story-only (#524), not part of @formrail/pro: the "customer updated on the server while you edit it" step of
// `Pro/Showcase/Record editing integrity`, plugged into the Free record-editing shell through the per-module
// `useAddons` add-on (#519), as sales-order-rebase.tsx does for the sales orders. `useFormRebase` merges every server
// version the store announces into the open customer (the nested address part by part, the contacts by id),
// `RebaseNotice` shows the result above the page, a Field in conflict says so, and the "Review changes" dialog names
// the server changes a save would overwrite. The contacts of a conflict are named by the engine (`itemLabel`, #534).
//
// A customer archived on the server while it is open: the Free page disables every field of an archived customer
// (its SAVED status); the user's changes stay in the form, are listed as text in a message (selectable, so they can be
// copied) and can no longer be saved: the server of this showcase refuses a write to an archived customer other than
// "Restore" (`withArchivedGuard`).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MessageStrip, Button } from '@formrail/core';
import { deepEqual } from '../../../core/src/object-page/equal';
import type { CustomerStore, StoredCustomer } from '../../../core/src/showcase/customer-store';
import type { CustomerValues } from '../../../core/src/showcase/modules/customers/customer-form';
import { CUSTOMERS, accountManagerOptions } from '../../../core/src/showcase/modules/customers/customers-module';
import type { RecordModule } from '../../../core/src/showcase/record-module';
import type { RecordEditorAddonContext, RecordEditorAddons, RecordSaveReview, UseRecordEditorAddons } from '../../../core/src/showcase/RecordPageShell';
import type { RecordServerChange } from '../../../core/src/showcase/record-store';
import { RebaseNotice } from '../form-rebase/RebaseNotice';
import type { OpenRebaseConflict, RebaseConflict } from '../form-rebase/types';
import { useFormRebase } from '../form-rebase/use-form-rebase';
import {
  CONTACTS_ORDER_ALSO_NOTE,
  CONTACTS_ORDER_ONLY_DESCRIPTION,
  CUSTOMER_ARRAY_ID_KEYS,
  CUSTOMER_LABELS,
  CustomerChanges,
  customerContactLabel,
  customerIsEqual,
  customerRenderValue,
  customerReview,
  customerSaveReview,
  reviewSides,
  sideOf,
  type CustomerReviewContext,
} from './customer-review';
import {
  NOTHING_LEFT_DESCRIPTION,
  OverwrittenChanges,
  REVIEW_LOCALE,
  createReviewSource,
  reviewDescription,
  sameConflicts,
  useReview,
  type ReviewSource,
} from './record-integrity';

/** What "Simulate server update" does to the stored customer (another user's edit). */
export type CustomerServerChangeKind = 'account-manager' | 'on-hold' | 'primary-contact-email' | 'remove-contact' | 'move-contact' | 'archive';

export const CUSTOMER_SERVER_CHANGES: readonly CustomerServerChangeKind[] = [
  'account-manager',
  'on-hold',
  'primary-contact-email',
  'remove-contact',
  'move-contact',
  'archive',
];

export interface CustomerRebaseOptions {
  /** What the simulated update changes. */
  serverChange: CustomerServerChangeKind;
  /** How long the simulated update takes to reach the server after the click (ms). */
  serverUpdateDelayMs: number;
  /** Shows "Simulate server update" in the header. */
  simulateServerUpdate: boolean;
  /** Called with every change of the open customer the server announces (Storybook Actions). */
  onServerChange?: ((change: RecordServerChange<StoredCustomer>) => void) | undefined;
}

type CustomerAddonContext = RecordEditorAddonContext<StoredCustomer, CustomerValues, never>;
type UseCustomerAddons = UseRecordEditorAddons<StoredCustomer, CustomerValues, never>;

/**
 * The account manager another user gives the customer: the next one of the sales staff (the options of the page's
 * Combobox, in their order) after the current one; the first one when the current one is not among them (they left).
 */
export function nextAccountManager(current: string): string {
  const options = accountManagerOptions();
  const index = options.findIndex((o) => o.value === current);
  return options[(index + 1) % options.length]!.value;
}

/** The status another user gives the customer with "on hold": an active one is put on hold, an on-hold one made active; an archived one stays archived. */
export const ON_HOLD_TOGGLE = { active: 'on-hold', 'on-hold': 'active', archived: 'archived' } as const satisfies Record<StoredCustomer['status'], StoredCustomer['status']>;

/** The e-mail another user gives the primary contact: `orders.` in front of the one stored. */
export const serverEmail = (email: string): string => `orders.${email}`;

/**
 * The change of another user, as a function of the customer the server holds when it lands. Deterministic, so a test
 * knows the server's value: `remove-contact` removes the LAST contact that is not the primary one (none: nothing
 * changes), `move-contact` moves the last contact to the top (a reorder only, with fewer than two contacts nothing
 * changes).
 */
export function serverChangeOf(kind: CustomerServerChangeKind): (customer: StoredCustomer) => StoredCustomer {
  switch (kind) {
    case 'account-manager':
      return (c) => ({ ...c, accountManagerId: nextAccountManager(c.accountManagerId) });
    case 'on-hold':
      return (c) => ({ ...c, status: ON_HOLD_TOGGLE[c.status] });
    case 'primary-contact-email':
      return (c) => ({ ...c, contacts: c.contacts.map((p) => (p.primary ? { ...p, email: serverEmail(p.email) } : p)) });
    case 'remove-contact':
      return (c) => {
        const removed = c.contacts.filter((p) => !p.primary).at(-1);
        return removed ? { ...c, contacts: c.contacts.filter((p) => p !== removed) } : c;
      };
    case 'move-contact':
      return (c) => (c.contacts.length < 2 ? c : { ...c, contacts: [c.contacts.at(-1)!, ...c.contacts.slice(0, -1)] });
    case 'archive':
      return (c) => ({ ...c, status: 'archived' });
  }
}

export const ARCHIVED_SAVE_ERROR = 'Could not save the customer: it was archived on the server.';

/**
 * The server rule of this showcase: an archived customer cannot be changed, only made active again ("Restore": the
 * stored customer with another status). Any other save of a customer stored as archived is refused with
 * {@link ARCHIVED_SAVE_ERROR} and the store is unchanged. The Free page never sends one (the fields of an archived
 * customer are disabled and its form is clean), but here another user can archive the customer under an edited form.
 * The check reads the store when the save is sent: a customer archived while a save is in flight was saved first,
 * then archived (the store replays the update on top of the save).
 */
export function withArchivedGuard(store: CustomerStore): CustomerStore {
  return {
    ...store,
    save: (customer) => {
      const stored = store.snapshot().find((c) => c.id === customer.id);
      // The server derives the account's country from the billing address on every write (customer-store.ts).
      const restoredOnly = stored !== undefined && deepEqual({ ...customer, status: stored.status, country: customer.billingAddress.country }, stored);
      if (stored?.status === 'archived' && !restoredOnly) return Promise.reject(new Error(ARCHIVED_SAVE_ERROR));
      return store.save(customer);
    },
  };
}

/** The Customers module of the integrity showcase: the Free one, with the server rule above. A static object (`RecordCrud`). */
export const CUSTOMERS_WITH_INTEGRITY: RecordModule<StoredCustomer, CustomerValues, never> = {
  ...CUSTOMERS,
  createStore: () => withArchivedGuard(CUSTOMERS.createStore()),
};

export const NOTICE_TITLE = 'This customer was updated while you were editing.';
export const CONFLICT_HELP = 'Changed on the server too.';
export const REMOVED_HELP = 'Removed on the server.';
export const ARCHIVED_TITLE = 'This customer was archived on the server';
export const ARCHIVED_TEXT = 'Its fields can no longer be changed and your changes can no longer be saved. They are listed below: copy what you need. Restore makes the customer active again and discards them.';
export const ARCHIVED_SAVED_TEXT = 'Its fields can no longer be changed. Nothing of yours was left unsaved. Restore makes the customer active again.';
export const ARCHIVED_REVIEW_DESCRIPTION = 'This customer was archived on the server: these changes can no longer be saved.';
export const UNSAVED_LIST_LABEL = 'Your unsaved changes';

/** The notice sits above the page (outside its padded scroller): the same side margins as the page's content. */
const NOTICE_MARGIN = { margin: '12px 16px' } as const;

/** The state the review dialog reads while it is open: it follows a server update that lands under it. */
interface ReviewState {
  context: CustomerReviewContext;
  conflicts: OpenRebaseConflict[];
  /** The customer was archived on the server: what the review lists can no longer be saved. */
  archived: boolean;
}

/** The description of the review, recomputed when the form changes under the dialog. */
function ReviewDescription({ source }: { source: ReviewSource<ReviewState> }) {
  const { context, archived } = useReview(source);
  if (archived) return <>{ARCHIVED_REVIEW_DESCRIPTION}</>;
  const { entries, reorders } = customerReview(context);
  if (entries.length > 0) return <>{reviewDescription(entries.length)}</>;
  return <>{reorders.length > 0 ? CONTACTS_ORDER_ONLY_DESCRIPTION : NOTHING_LEFT_DESCRIPTION}</>;
}

/** The body of the review: the server changes the save would overwrite, then the changes to save. */
function ReviewBody({ source }: { source: ReviewSource<ReviewState> }) {
  const { context, conflicts } = useReview(source);
  const { entries, reorders } = customerReview(context);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <OverwrittenChanges conflicts={conflicts} />
      {entries.length > 0 ? <CustomerChanges entries={entries} sides={reviewSides(context)} /> : null}
      {reorders.length > 0 && entries.length > 0 ? <p style={{ margin: 0 }}>{CONTACTS_ORDER_ALSO_NOTE}</p> : null}
    </div>
  );
}

/**
 * The hook plugged into the editor (`useAddons`). It never changes the order of its hooks: the editor calls it at
 * every render of an existing customer.
 */
export function useCustomerRebase({ form, record, store, toValues, scrollerRef }: CustomerAddonContext, options: CustomerRebaseOptions): RecordEditorAddons<CustomerValues> {
  const rebase = useFormRebase(form, {
    arrayIdKeys: CUSTOMER_ARRAY_ID_KEYS,
    labels: CUSTOMER_LABELS,
    // Read when a rebase is applied: the saved currency and the one in the form (the user may be changing it).
    isEqual: customerIsEqual(form.baseline.currency, form.values.currency),
    itemLabel: customerContactLabel,
  });
  const optionsRef = useRef(options);
  const latest = useRef({ rebase: rebase.rebase, toValues });
  useEffect(() => {
    optionsRef.current = options;
    latest.current = { rebase: rebase.rebase, toValues };
  });

  // The versions the server announced (the form's baseline is one of them once the rebase applied it). Not a ref:
  // read during the render, written only by the subscription (then the rebase renders again).
  const [fromServer] = useState(() => new WeakSet<CustomerValues>());

  // Every version of THIS customer the server announces is merged into the editor (queued during a save).
  useEffect(
    () =>
      store.subscribe((change) => {
        if (change.id !== record.id) return;
        optionsRef.current.onServerChange?.(change);
        // Customers are archived, never deleted (the module has no deletion): no update announces `null`.
        if (change.record === null) return;
        const incoming = latest.current.toValues(change.record);
        fromServer.add(incoming);
        latest.current.rebase(incoming);
      }),
    [store, record.id, fromServer],
  );

  const simulate = useCallback(() => {
    const { serverChange, serverUpdateDelayMs } = optionsRef.current;
    // The other user's change fails only if the customer is gone, which this module never does.
    void store.updateFromServer(record.id, serverChangeOf(serverChange), serverUpdateDelayMs).catch(() => undefined);
  }, [store, record.id]);

  // Archived by the server while open: the saved customer (the baseline) is a version the server announced, and it is
  // archived. Archived by the user's own Save (the Free flow) or loaded archived, it is not: the Free page says so.
  const archived = form.baseline.status === 'archived' && fromServer.has(form.baseline);
  const { conflicts } = rebase;

  // The review dialog reads the form through this source while it is open: an update may land under it.
  const [review] = useState(() => createReviewSource<ReviewState>({ context: { values: form.values, baseline: form.baseline }, conflicts, archived }));
  useEffect(() => {
    const current = review.get();
    if (current.context.values === form.values && current.context.baseline === form.baseline && sameConflicts(current.conflicts, conflicts) && current.archived === archived) return;
    review.set({ context: { values: form.values, baseline: form.baseline }, conflicts, archived });
  });

  const reviewSave = useCallback(
    (context: CustomerReviewContext): RecordSaveReview | null => {
      const base = customerSaveReview(context);
      const { conflicts: open, archived: closed } = review.get();
      if (!base && open.length === 0) return null;
      review.set({ context, conflicts: open, archived: closed });
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

  // The focus was in a field that the archiving just disabled (a disabled control loses the focus, which falls to the
  // page): it goes to the message that says why, never left on `<body>`.
  const archivedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = archivedRef.current;
    if (!archived || !strip) return;
    const active = strip.ownerDocument.activeElement;
    if (!active || active === strip.ownerDocument.body || active.matches(':disabled')) strip.focus();
  }, [archived]);

  const fieldHelp = (path: string): ReactNode => {
    for (const conflict of conflicts) {
      // The field at the conflict's current position (its contact may have moved since the rebase).
      if (path === conflict.currentPath || path.startsWith(`${conflict.currentPath}.`)) return conflict.theirsMissing ? REMOVED_HELP : CONFLICT_HELP;
    }
    return undefined;
  };

  // In a conflict, "Yours" is the form and "Server" the saved customer (the server's version once the rebase applied).
  const renderValue = customerRenderValue({ before: sideOf(form.values), after: sideOf(form.baseline) });
  const unsaved = archived ? customerReview({ values: form.values, baseline: form.baseline }).entries : [];

  const notice = (
    <>
      {archived ? (
        <MessageStrip ref={archivedRef} tabIndex={-1} tone="error" title={ARCHIVED_TITLE} style={NOTICE_MARGIN}>
          <p style={{ margin: 0 }}>{unsaved.length > 0 ? ARCHIVED_TEXT : ARCHIVED_SAVED_TEXT}</p>
          {unsaved.length > 0 ? (
            <div style={{ marginBlockStart: 8 }}>
              <CustomerChanges entries={unsaved} sides={reviewSides({ values: form.values, baseline: form.baseline })} label={UNSAVED_LIST_LABEL} />
            </div>
          ) : null}
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
        renderValue={renderValue}
        locale={REVIEW_LOCALE}
        timeZone="UTC"
      />
    </>
  );

  return {
    notice,
    actions: options.simulateServerUpdate ? (
      <Button variant="secondary" onClick={simulate}>
        Simulate server update
      </Button>
    ) : null,
    fieldHelp,
    reviewSave,
  };
}

/** The control of a form path (`data-rop-name` is the Field's `name`); for a whole contact, its first field (the name). */
const controlOf = (path: string): HTMLElement | null => {
  const name = CSS.escape(path);
  return document.querySelector<HTMLElement>(`[data-rop-name="${name}"]`) ?? document.querySelector<HTMLElement>(`[data-rop-name^="${name}."]`);
};

/**
 * `focusTargetFor` of the notice: where the focus goes when a choice closes the last conflict. The control of the
 * field the conflict was about, at its current position (`currentPath`, read when the choice was made); for a whole
 * contact, its name.
 *
 * A contact the server removed, after "Use server value": that contact is gone, and `currentPath` (say `contacts.1`)
 * now names the contact that took its place. So the focus goes to the name of the NEXT contact (the one that moved up
 * into that position), else of the previous one (the removed contact was the last), else to "Add contact" (its
 * `data-rop-name` is `contacts`). The focus never lands on `<body>`.
 */
function fieldOf(conflict: RebaseConflict): HTMLElement | null {
  const path = 'currentPath' in conflict && typeof conflict.currentPath === 'string' ? conflict.currentPath : conflict.path;
  const own = controlOf(path);
  if (own) return own;
  const [head, row] = path.split('.');
  if (head !== 'contacts' || row === undefined) return null;
  for (let index = Number(row) - 1; index >= 0; index -= 1) {
    const previous = controlOf(`contacts.${index}`);
    if (previous) return previous;
  }
  return controlOf('contacts');
}

/** The `useAddons` of the story: one hook per mount, reading the latest story args. */
export function customerRebaseAddons(options: { readonly current: CustomerRebaseOptions }): UseCustomerAddons {
  return function useCustomerRebaseAddons(context) {
    return useCustomerRebase(context, options.current);
  };
}
