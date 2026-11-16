// Story-only: the CRUD showcase of the invoices (#363 Create, #365 Delete, #366 Bulk delete): the record-editing
// shell (`RecordCrud`, RecordCrud.tsx: the flow, described there) with the Invoices module
// (modules/invoices/invoices-module.tsx: the domain), since #519. The props of before #519 stay, except the
// story-only add-ons, now per module (`addons: { invoices: { reviewSave, useAddons } }`). Not exported by the
// package.
import type { InvoiceDraft, StoredInvoice } from './invoice-store';
import { INVOICES, type InvoiceFormValues } from './modules/invoices/invoices-module';
import { RecordCrud, type RecordCrudProps } from './RecordCrud';
import type { RecordAddons } from './RecordPageShell';

export type { CrudNavigateEvent } from './RecordCrud';

/** The story-only add-ons of the invoices (#377 `reviewSave`, #384 `useAddons`): see `RecordAddons`. */
export type InvoiceAddons = RecordAddons<StoredInvoice, InvoiceFormValues, InvoiceDraft>;

export interface DeletedInvoice {
  id: string;
  number: string;
}

export interface InvoiceCrudProps
  extends Omit<RecordCrudProps<StoredInvoice, InvoiceFormValues, InvoiceDraft>, 'module' | 'onDeleted' | 'addons'> {
  /** Called once per invoice the server deleted (`{ id, number }`; also when it was already gone), even if the page was left meanwhile. */
  onDeleted?: (invoice: DeletedInvoice) => void;
  /**
   * Story-only extension points, per module (#519): `addons.invoices.reviewSave` (#377) shows a review dialog before
   * saving an EXISTING invoice (never a creation); `addons.invoices.useAddons` (#384) plugs a hook into its editor.
   * Absent, the showcase is unchanged.
   */
  addons?: { invoices?: InvoiceAddons };
}

export function InvoiceCrud({ onDeleted, ...props }: InvoiceCrudProps) {
  return (
    <RecordCrud<StoredInvoice, InvoiceFormValues, InvoiceDraft>
      {...props}
      module={INVOICES}
      onDeleted={onDeleted && ((invoice) => onDeleted({ id: invoice.id, number: invoice.number }))}
    />
  );
}
