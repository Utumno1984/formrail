// Story-only: the CRUD showcase (#363: Create; Delete follows in #365/#366). The list of
// `InvoiceListToRecord` plus a "New invoice" action that opens the SAME multi-section editor in creation mode
// (`InvoiceEditor` with `record={null}`; `useObjectPageForm` has no "create mode": the baseline is the
// defaults and the save handler calls `store.create`). The route is `create=1` (see `showcase-router.ts`).
//
// After a successful Create the page goes back to the list (not to the created record): `history.back()`
// when the list pushed the entry (filters, search, sort and scroll restored as for the Update), the focus on
// the new record's link when the current filters show it (the title otherwise), and a toast. Declared
// consequence: Forward after the return reopens an EMPTY creation form, not the record that was created.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '../button/Button';
import { ToastProvider } from '../toast/ToastProvider';
import { useToast } from '../toast/use-toast';
import { InvoiceEditor, InvoiceRecordPage } from './InvoiceRecordPage';
import { ListView } from './InvoiceListToRecord';
import { createInvoiceApi } from './invoice-api';
import { createInvoiceStore, type InvoiceStore, type SaveOutcome, type StoredInvoice } from './invoice-store';
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
}: InvoiceCrudProps) {
  const toast = useToast();
  // One store per mount of the story: nothing shared between stories.
  const [store] = useState(() => createInvoiceStore());
  const delays = useRef({ listLoadDelayMs, recordLoadDelayMs });
  const callbacks = useRef({ onNavigate, onSaved, onCreated });
  useEffect(() => {
    delays.current = { listLoadDelayMs, recordLoadDelayMs };
    callbacks.current = { onNavigate, onSaved, onCreated };
  });
  // Layout effect: applies before the page's passive effects, so a changed control reaches the next call.
  useLayoutEffect(() => {
    store.configure({ saveDelayMs, saveOutcome });
  }, [store, saveDelayMs, saveOutcome]);
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

  if (record) return <InvoiceRecordPage store={api} recordId={record} onBack={back} onSaved={saved} />;
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
    <ListView
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
    />
  );
}

export function InvoiceCrud(props: InvoiceCrudProps) {
  return (
    <ToastProvider>
      <CrudInner {...props} />
    </ToastProvider>
  );
}
