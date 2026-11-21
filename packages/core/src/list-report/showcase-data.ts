// Story-only data of the List Report showcase (not exported by the package). Status labels for the demo
// invoices (moved here from `showcase/` by #527); the fixtures themselves (`internal/demo-invoices.ts`) are already in English.
import { makeDemoInvoices, type DemoInvoice, type DemoInvoiceStatus } from '../internal/demo-invoices';

export const STATUS_LABEL: Record<DemoInvoiceStatus, string> = {
  pending: 'Open',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** `makeDemoInvoices` (the supplier names are already in English). */
export const makeShowcaseInvoices = (count = 200): DemoInvoice[] => makeDemoInvoices(count);
