// Fictitious supplier invoices for the List Report showcase and its tests. Deterministic on purpose
// (no Math.random, no clock): the visual baselines and the e2e scenarios depend on these exact rows.

export type DemoInvoiceStatus = 'pending' | 'approved' | 'rejected';

export interface DemoInvoice {
  id: string;
  number: string;
  supplier: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  /** Euro. */
  amount: number;
  status: DemoInvoiceStatus;
}

export const DEMO_SUPPLIERS = [
  'Rossi Construction Ltd',
  'Bianchi Supplies',
  'Verdi Installations',
  'Neri Transport',
  'Gialli Office',
  'Esposito Services',
  'Ferrari Mechanics',
  'Romano Logistics',
  'Colombo Computing',
  'Ricci Furnishings',
  'Marino Energy',
  'Greco Consulting',
];

export const DEMO_STATUS_LABEL: Record<DemoInvoiceStatus, string> = {
  pending: 'To approve',
  approved: 'Approved',
  rejected: 'Rejected',
};

// A multiplicative hash (Knuth): the same index always gives the same number.
const hash = (n: number): number => Math.imul(n + 1, 2654435761) >>> 0;

export function makeDemoInvoices(count = 200): DemoInvoice[] {
  return Array.from({ length: count }, (_, i) => {
    const bucket = hash(i * 3 + 2) % 10;
    const day = hash(i * 5 + 1) % 270;
    return {
      id: `inv-${i + 1}`,
      number: `FT-2026-${String(i + 1).padStart(4, '0')}`,
      supplier: DEMO_SUPPLIERS[hash(i) % DEMO_SUPPLIERS.length]!,
      date: new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10),
      amount: (5000 + (hash(i * 7 + 3) % 495000)) / 100,
      status: bucket < 5 ? 'pending' : bucket < 9 ? 'approved' : 'rejected',
    };
  });
}

/** `1.234,50 €`, whatever the runtime locale. */
export const formatEuro = (value: number): string =>
  `${value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
