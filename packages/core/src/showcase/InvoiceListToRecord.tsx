// Story-only: List Report -> Object Page as a DEDICATED PAGE (#150). Since #519 the record-editing shell
// (`RecordCrud`) with the Invoices module WITHOUT creation and deletion: the list (`RecordListView`) reads its rows
// from the in-memory store; the "Number" cell is a real link; opening it writes `record=<id>` in the URL and shows
// the detail INSTEAD of the list (the list is unmounted); Back brings the list back with pill, search, sort,
// scroll and focus restored. No toast, no "New invoice", no row menu, no selection.
//
// RECIPE (documented in `showcase-router.ts`, no new library API): the "router" is ~100 lines on `history` +
// `popstate`, shared with the CRUD showcase (#363). The list restores its scroll by itself
// (`useListReportScrollRestoration`); focus goes back to the opened row's link, or to the title.
import type { InvoiceDraft, SaveOutcome, StoredInvoice } from './invoice-store';
import { INVOICES, type InvoiceFormValues } from './modules/invoices/invoices-module';
import type { RecordModule } from './record-module';
import { RecordCrud } from './RecordCrud';

export type NavigateEvent = { to: 'record'; id: string } | { to: 'list' };

export interface InvoiceListToRecordProps {
  /** How a list gesture (pill, search, sort) writes the URL. Navigation to a record is always a `push`. */
  history: 'replace' | 'push';
  listLoadDelayMs: number;
  recordLoadDelayMs: number;
  /** Called on the list <-> record navigations the user starts (link, "Back to list"), never on Back/Forward. */
  onNavigate: (event: NavigateEvent) => void;
  /** How long a save takes (#151). Default 400. A promise holds every save until it settles (for tests). */
  saveDelayMs?: number | Promise<void>;
  /** `error`: the save fails, the form stays dirty and the store is unchanged (#151). Default `success`. */
  saveOutcome?: SaveOutcome;
  /** Called once per successful save with the record as the server stored it, even if the page was left meanwhile. */
  onSaved?: (invoice: StoredInvoice) => void;
}

/** The Invoices module with its list and record page only. */
const INVOICE_LIST_TO_RECORD: RecordModule<StoredInvoice, InvoiceFormValues, InvoiceDraft> = {
  ...INVOICES,
  create: undefined,
  delete: false,
  deleteMany: false,
};

export function InvoiceListToRecord({ onNavigate, ...props }: InvoiceListToRecordProps) {
  return (
    <RecordCrud
      {...props}
      module={INVOICE_LIST_TO_RECORD}
      // Without creation the shell never reports `{ to: 'create' }`.
      onNavigate={(event) => {
        if (event.to !== 'create') onNavigate(event);
      }}
    />
  );
}
