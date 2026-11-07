// Story-only data shared by the Showcase stories (not exported by the package). Status labels and tones
// for the demo invoices; the fixtures themselves (`internal/demo-invoices.ts`) are already in English.
import { DEMO_SUPPLIERS, makeDemoInvoices, type DemoInvoice, type DemoInvoiceStatus } from '../internal/demo-invoices';

export const STATUS_LABEL: Record<DemoInvoiceStatus, string> = {
  pending: 'Open',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const SUPPLIERS_EN: readonly string[] = DEMO_SUPPLIERS;

export const STATUS_TONE: Record<DemoInvoiceStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

/** `makeDemoInvoices` (the supplier names are already in English). */
export const makeShowcaseInvoices = (count = 200): DemoInvoice[] => makeDemoInvoices(count);
