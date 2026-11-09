// Story-only: the CRUD showcase (#363: Create; Delete follows in #365/#366). The list of
// `InvoiceListToRecord` plus a "New invoice" action that opens the SAME multi-section editor in creation mode
// (`InvoiceEditor` with `record={null}`; `useObjectPageForm` has no "create mode": the baseline is the
// defaults and the save handler calls `store.create`). The route is `create=1` (see `showcase-router.ts`).
//
// After a successful Create the page goes back to the list (not to the created record): `history.back()`
// when the list pushed the entry (filters, search, sort and scroll restored as for the Update), the focus on
// the new record's link when the current filters show it (the title otherwise), and a toast. Declared
// consequence: Forward after the return reopens an EMPTY creation form, not the record that was created.
//
// DELETE (#365), two recipes, no library API (the optimism and the rollback are showcase code):
//   - from the list, OPTIMISTIC: "Delete" in the row's "…" menu -> `confirm()` (no `onConfirm`, so it closes
//     at once) -> the id enters `pendingDeletes`, which `ListView` leaves out of the rows it gives to
//     `useListReport`, then `store.delete` runs. Success: the id moves to `deletedIds` (still left out) and a
//     toast. Failure: the id leaves the set and the row comes back exactly where the CURRENT filters, search
//     and sort put it (the rows are derived from the data, never rebuilt), with an error toast; the focus is
//     not moved (the user may be elsewhere by then). `InvoiceNotFoundError` counts as a success: the record
//     is gone either way, so no row comes back for it.
//     The focus: the row's "…" (the dialog's opener) goes away with the row. The confirmation gets a
//     `returnFocusRef` whose target is chosen when the user confirms, while the row is still on screen: the
//     "…" of the next row, else of the previous one, else the list title; never `body`.
//   - from the record page, PESSIMISTIC: `confirm({ onConfirm: store.delete })` keeps the dialog pending until
//     the server answers (see `InvoiceEditor`); then back to the list, past the dirty-guard, which the editor
//     disarms first. The list focuses its title (the deleted row's link is not there to go back to).
// Deletes outlive the page that started them: the sets live here, and a list mounted meanwhile (or loading
// again) still leaves the ids out until each delete settles.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { Button } from '../button/Button';
import { useConfirmDialog } from '../confirm-dialog/use-confirm-dialog';
import type { DemoInvoice } from '../internal/demo-invoices';
import type { ListReportRowAction } from '../list-report/types';
import { ToastProvider } from '../toast/ToastProvider';
import { useToast } from '../toast/use-toast';
import { InvoiceEditor, InvoiceRecordPage } from './InvoiceRecordPage';
import { ListView, type ListViewProps } from './InvoiceListToRecord';
import { createInvoiceApi } from './invoice-api';
import {
  createInvoiceStore,
  InvoiceNotFoundError,
  type DeleteOutcome,
  type InvoiceStore,
  type SaveOutcome,
  type StoredInvoice,
} from './invoice-store';
import {
  isLeaving,
  leaveRoute,
  openCreate,
  openRecord,
  readCreate,
  readRecord,
  subscribeRoute,
} from './showcase-router';

export type CrudNavigateEvent = { to: 'record'; id: string } | { to: 'create' } | { to: 'list' };

export interface InvoiceCrudProps {
  /** How a list gesture (pill, search, sort) writes the URL. Navigation to a page is always a `push`. */
  history: 'replace' | 'push';
  listLoadDelayMs: number;
  recordLoadDelayMs: number;
  /** Called on the navigations the user starts (link, "New invoice", "Back to list", "Cancel"), never on Back/Forward. */
  onNavigate: (event: CrudNavigateEvent) => void;
  /** How long a save or a create takes. Default 400. A promise holds every write until it settles (for tests). */
  saveDelayMs?: number | Promise<void>;
  /** `error`: the save or create fails, the form stays dirty and the store is unchanged. Default `success`. */
  saveOutcome?: SaveOutcome;
  /** Called once per successful Update with the record as the server stored it, even if the page was left meanwhile. */
  onSaved?: (invoice: StoredInvoice) => void;
  /** Called once per successful Create with the record as the server stored it, even if the page was left meanwhile. */
  onCreated?: (invoice: StoredInvoice) => void;
  /** The default invoice date of a new invoice (yyyy-mm-dd). Default: the local date. Fixed in the visual stories. */
  today?: string;
  /** `error`: a delete fails (the row comes back, the record page keeps the dialog open). Default `success`. Waits `saveDelayMs`. */
  deleteOutcome?: DeleteOutcome;
  /** Called once per record the server deleted (also when it was already gone), even if the page was left meanwhile. */
  onDeleted?: (invoice: DeletedInvoice) => void;
}

export interface DeletedInvoice {
  id: string;
  number: string;
}

const NONE: ReadonlySet<string> = new Set();
const withId = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => new Set(set).add(id);
const withoutId = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(set);
  next.delete(id);
  return next;
};

const ROW_TRIGGER = 'button[aria-label^="Actions for "]';

/**
 * Where the focus goes once the row of `trigger` is gone: the "…" of the row that takes its place (the next
 * one), else of the previous one, else the list title. Read while the row is still in the document.
 */
function focusTargetAfterRow(trigger: HTMLElement | null): HTMLElement | null {
  const row = trigger?.closest('tr');
  if (!row) return null;
  for (const sibling of [row.nextElementSibling, row.previousElementSibling]) {
    const next = sibling?.querySelector<HTMLElement>(ROW_TRIGGER);
    if (next) return next;
  }
  let scope: HTMLElement | null = row.closest('table');
  while (scope && !scope.querySelector('h2')) scope = scope.parentElement;
  const title = scope?.querySelector<HTMLElement>('h2') ?? null;
  if (title) title.tabIndex = -1; // focusable from script only
  return title;
}

function CrudInner({
  history,
  listLoadDelayMs,
  recordLoadDelayMs,
  onNavigate,
  saveDelayMs = 400,
  saveOutcome = 'success',
  onSaved,
  onCreated,
  today,
  deleteOutcome = 'success',
  onDeleted,
}: InvoiceCrudProps) {
  const toast = useToast();
  // One store per mount of the story: nothing shared between stories.
  const [store] = useState(() => createInvoiceStore());
  const delays = useRef({ listLoadDelayMs, recordLoadDelayMs });
  const callbacks = useRef({ onNavigate, onSaved, onCreated, onDeleted });
  useEffect(() => {
    delays.current = { listLoadDelayMs, recordLoadDelayMs };
    callbacks.current = { onNavigate, onSaved, onCreated, onDeleted };
  });
  // Layout effect: applies before the page's passive effects, so a changed control reaches the next call.
  useLayoutEffect(() => {
    store.configure({ saveDelayMs, saveOutcome, deleteOutcome });
  }, [store, saveDelayMs, saveOutcome, deleteOutcome]);
  // A delete settling after the story unmounted updates nothing on screen.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const api = useMemo<InvoiceStore>(() => createInvoiceApi(store, delays), [store]);
  useEffect(() => {
    window.__ropShowcaseStore = store;
    return () => {
      if (window.__ropShowcaseStore === store) delete window.__ropShowcaseStore;
    };
  }, [store]);

  const record = useSyncExternalStore(subscribeRoute, readRecord, () => null);
  const create = useSyncExternalStore(subscribeRoute, readCreate, () => false);
  // Written in an effect (after the page committed), read at the list's mount: a list that appears after a
  // page is a return. `lastRecord`: the row the focus goes back to.
  const cameFromPage = useRef(false);
  const lastRecord = useRef<string | null>(null);
  useEffect(() => {
    if (record) {
      cameFromPage.current = true;
      lastRecord.current = record;
    } else if (create) {
      cameFromPage.current = true;
    }
  }, [record, create]);

  // The record created and not yet announced: the list shows the toast once its data is in.
  const [justCreated, setJustCreated] = useState<StoredInvoice | null>(null);

  const open = useRef((id: string) => {
    callbacks.current.onNavigate({ to: 'record', id });
    openRecord(id);
  }).current;
  const openNew = useRef(() => {
    if (readCreate()) return; // a double click: one entry, one report
    callbacks.current.onNavigate({ to: 'create' });
    lastRecord.current = null;
    openCreate();
  }).current;
  const saved = useRef((invoice: StoredInvoice) => callbacks.current.onSaved?.(invoice)).current;
  const back = useRef(() => {
    if (isLeaving()) return; // already on its way back: no second navigation, no second report
    callbacks.current.onNavigate({ to: 'list' });
    leaveRoute();
  }).current;
  // The store accepted the record (also when the page was left meanwhile with "Leave anyway"): it is the one
  // to announce and the row to focus. This is not the navigation: that starts from the editor, once clean.
  const createdRef = useRef((invoice: StoredInvoice) => {
    lastRecord.current = invoice.id;
    setJustCreated(invoice);
    callbacks.current.onCreated?.(invoice);
  }).current;
  const createDone = useRef(() => {
    if (isLeaving()) return;
    leaveRoute(); // not reported as a user navigation: it is the consequence of the Create
  }).current;
  const announce = useRef((invoice: StoredInvoice, visible: boolean) => {
    const title = `Invoice ${invoice.number} created`;
    toast.show(
      visible
        ? { tone: 'success', description: title }
        : { tone: 'success', title, description: 'Not shown with the current filters.' },
    );
    setJustCreated(null);
  }).current;

  // The user went elsewhere (a row, "New invoice", Back/Forward) after the list came back but BEFORE its data
  // arrived: the list that was to announce the Create is gone, and the confirmation must not vanish with it.
  // Announce it from here (this component outlives every page); the filters can no longer be judged, and the
  // focus move no longer makes sense, so it is the plain message. `listReturned` tells this apart from the
  // moment right after the store accepted the record, when the creation page is still on screen.
  const listReturned = useRef(false);
  useEffect(() => {
    if (!justCreated) {
      listReturned.current = false;
    } else if (!record && !create) {
      listReturned.current = true;
    } else if (listReturned.current) {
      announce(justCreated, true);
    }
  }, [justCreated, record, create, announce]);

  /* ------------------------------------------------------------------------------- delete (#365) */

  // In flight (optimistic, list only) and done: both left out of the list's rows.
  const [pendingDeletes, setPendingDeletes] = useState<ReadonlySet<string>>(NONE);
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(NONE);
  const hiddenIds = useMemo(
    () => (pendingDeletes.size === 0 ? deletedIds : new Set([...deletedIds, ...pendingDeletes])),
    [pendingDeletes, deletedIds],
  );

  // The server call shared by both recipes: resolves when the record is gone (also when it already was),
  // rejects (after the error toast) otherwise.
  const deleteOnServer = useRef(async (invoice: DeletedInvoice): Promise<void> => {
    try {
      await api.delete(invoice.id);
    } catch (error) {
      if (!(error instanceof InvoiceNotFoundError)) {
        if (mounted.current) toast.show({ tone: 'error', description: `Could not delete ${invoice.number}` });
        throw error;
      }
    }
    callbacks.current.onDeleted?.({ id: invoice.id, number: invoice.number });
    if (!mounted.current) return;
    // Added to `deletedIds` BEFORE leaving `pendingDeletes` (the caller's `finally`): never shown in between.
    setDeletedIds((ids) => withId(ids, invoice.id));
    toast.show({ tone: 'success', description: `Invoice ${invoice.number} deleted` });
  }).current;

  // Confirmed in the list (`CrudList`): hidden at once, then the server call; rolled back if it fails.
  const deleteFromList = useRef(async (row: DemoInvoice) => {
    setPendingDeletes((ids) => withId(ids, row.id));
    try {
      await deleteOnServer(row);
    } catch {
      // Rolled back below: the row comes back where it belongs; the error toast is already up.
    } finally {
      if (mounted.current) setPendingDeletes((ids) => withoutId(ids, row.id));
    }
  }).current;

  const deleteFromPage = useRef((invoice: StoredInvoice) => deleteOnServer(invoice)).current;
  const deleteDone = useRef(() => {
    if (isLeaving()) return;
    leaveRoute(); // not reported as a user navigation: it is the consequence of the Delete
  }).current;

  if (record) {
    return (
      <InvoiceRecordPage
        store={api}
        recordId={record}
        onBack={back}
        onSaved={saved}
        onDelete={deleteFromPage}
        onDeleteDone={deleteDone}
      />
    );
  }
  if (create) {
    return (
      <InvoiceEditor
        key="create"
        store={api}
        record={null}
        today={today}
        onBack={back}
        onCreated={createdRef}
        onCreateDone={createDone}
        focusTitleOnMount
      />
    );
  }
  return (
    <CrudList
      onDelete={deleteFromList}
      store={api}
      history={history}
      returning={cameFromPage.current}
      returnedFrom={lastRecord.current}
      onOpen={open}
      created={justCreated}
      onCreatedReady={(visible) => justCreated && announce(justCreated, visible)}
      actions={
        <Button variant="primary" onClick={openNew}>
          New invoice
        </Button>
      }
      hiddenIds={hiddenIds}
    />
  );
}

/**
 * The list with its row "Delete". The confirmation belongs to the list: leaving it (a link, Back) unmounts it
 * and `useConfirmDialog` resolves an open confirmation with `false`, so nothing is deleted from a list that is
 * no longer on screen.
 */
function CrudList({ onDelete, ...props }: Omit<ListViewProps, 'rowActions'> & { onDelete: (row: DemoInvoice) => void }) {
  const [confirm, confirmDialog] = useConfirmDialog();
  const rowActions = useCallback(
    (row: DemoInvoice): readonly ListReportRowAction[] => [
      {
        id: 'delete',
        label: 'Delete',
        tone: 'danger',
        onSelect: ({ returnFocusRef: rowFocusRef }) => {
          // Chosen on confirmation, while the row is still on screen; until then (Cancel, Escape) the row's own
          // "…" (the table's scroll container once that is gone, see `ListReportRowActionContext`).
          let afterDelete: HTMLElement | null = null;
          const returnFocusRef: RefObject<HTMLElement | null> = {
            get current() {
              return afterDelete?.isConnected ? afterDelete : rowFocusRef.current;
            },
            set current(_value) {
              /* read-only view */
            },
          };
          void confirm({
            title: `Delete invoice ${row.number}?`,
            description: 'The invoice is deleted permanently.',
            confirmLabel: 'Delete invoice',
            returnFocusRef,
          }).then((confirmed) => {
            if (!confirmed) return;
            afterDelete = focusTargetAfterRow(rowFocusRef.current);
            onDelete(row);
          });
        },
      },
    ],
    [confirm, onDelete],
  );
  return (
    <>
      <ListView {...props} rowActions={rowActions} />
      {confirmDialog}
    </>
  );
}

export function InvoiceCrud(props: InvoiceCrudProps) {
  return (
    <ToastProvider>
      <CrudInner {...props} />
    </ToastProvider>
  );
}
