// Story-only data shared by the Showcase stories (not exported by the package). English labels for the
// demo invoices; the fixtures themselves (`internal/demo-invoices.ts`) stay untouched because the
// existing baselines depend on them.
import { makeDemoInvoices, type DemoInvoice, type DemoInvoiceStatus } from '../internal/demo-invoices';

export const STATUS_LABEL: Record<DemoInvoiceStatus, string> = {
  pending: 'Open',
  approved: 'Approved',
  rejected: 'Rejected',
};

// Supplier names in English (surnames kept, so a search for "rossi" still matches).
export const SUPPLIER_EN: Record<string, string> = {
  'Rossi Costruzioni S.r.l.': 'Rossi Construction Ltd',
  'Bianchi Forniture': 'Bianchi Supplies',
  'Verdi Impianti': 'Verdi Installations',
  'Neri Trasporti': 'Neri Transport',
  'Gialli Ufficio': 'Gialli Office',
  'Esposito Servizi': 'Esposito Services',
  'Ferrari Meccanica': 'Ferrari Mechanics',
  'Romano Logistica': 'Romano Logistics',
  'Colombo Informatica': 'Colombo Computing',
  'Ricci Arredi': 'Ricci Furnishings',
  'Marino Energia': 'Marino Energy',
  'Greco Consulenze': 'Greco Consulting',
};

export const SUPPLIERS_EN: readonly string[] = Object.values(SUPPLIER_EN);

export const STATUS_TONE: Record<DemoInvoiceStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

/** `makeDemoInvoices` with the supplier names in English. */
export const makeShowcaseInvoices = (count = 200): DemoInvoice[] =>
  makeDemoInvoices(count).map((r) => ({ ...r, supplier: SUPPLIER_EN[r.supplier] ?? r.supplier }));
