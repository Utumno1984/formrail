// Story-only: the invoice detail page, i.e. the record page of the shell (`RecordPage`/`RecordEditor`,
// RecordPageShell.tsx) with the Invoices module (modules/invoices/invoices-module.tsx), since #519. The names and
// types of before #519 stay here for the stories, the tests and the Pro showcase. Not exported by the package.
import type { InvoiceDraft, InvoiceStore, StoredInvoice } from './invoice-store';
import { INVOICES, type InvoiceFormValues } from './modules/invoices/invoices-module';
import {
  RecordEditor,
  RecordPage,
  type RecordEditorAddonContext,
  type RecordEditorAddons,
  type RecordEditorProps,
  type RecordPageProps,
  type RecordSaveReview,
  type RecordSaveReviewContext,
  type RecordSaveReviewer,
  type UseRecordEditorAddons,
} from './RecordPageShell';

export { sameAmount, sameValues, type InvoiceFormValues, type InvoiceValues } from './modules/invoices/invoices-module';

/** What `reviewSave` receives per side: the scalar values plus the line items (#379). */
export type InvoiceReviewValues = InvoiceFormValues;
export type InvoiceSaveReviewContext = RecordSaveReviewContext<InvoiceReviewValues>;
export type InvoiceSaveReview = RecordSaveReview;
export type InvoiceSaveReviewer = RecordSaveReviewer<InvoiceReviewValues>;
export type InvoiceEditorAddonContext = RecordEditorAddonContext<StoredInvoice, InvoiceFormValues, InvoiceDraft>;
export type InvoiceEditorAddons = RecordEditorAddons<InvoiceFormValues>;
/** Story-only extension point (#384, used by the Pro showcase): see `UseRecordEditorAddons`. */
export type UseInvoiceEditorAddons = UseRecordEditorAddons<StoredInvoice, InvoiceFormValues, InvoiceDraft>;

export type InvoiceRecordPageProps = Omit<RecordPageProps<StoredInvoice, InvoiceFormValues, InvoiceDraft>, 'module' | 'store'> & {
  store: InvoiceStore;
};
export type InvoiceEditorProps = Omit<RecordEditorProps<StoredInvoice, InvoiceFormValues, InvoiceDraft>, 'module' | 'store'> & {
  store: InvoiceStore;
};

/** Loads the invoice, then mounts the editor. No editable field exists until the invoice has arrived. */
export function InvoiceRecordPage(props: InvoiceRecordPageProps) {
  return <RecordPage module={INVOICES} {...props} />;
}

/** The editor of an invoice (`record`), or of a new one (`record={null}`), mounted already hydrated. */
export function InvoiceEditor(props: InvoiceEditorProps) {
  return <RecordEditor module={INVOICES} {...props} />;
}
