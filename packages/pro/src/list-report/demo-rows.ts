// Story/e2e fixture (not exported by the package): fictitious supplier invoices, deterministic on
// purpose (no Math.random, no clock), extended to any number of rows. Same generator as the core's
// demo invoices (`packages/core/src/internal/demo-invoices.ts`, private to core), with English labels.

export type DemoStatus = 'pending' | 'approved' | 'rejected';

export interface DemoRow {
  id: string;
  number: string;
  supplier: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  amount: number;
  status: DemoStatus;
}

const SUPPLIERS = [
  'Northwind Building Ltd',
  'Bluebell Supplies',
  'Greenfield Systems',
  'Blackstone Freight',
  'Yellowpage Office',
  'Harbor Services',
  'Ironworks Mechanics',
  'Riverside Logistics',
  'Pinecone Computing',
  'Oakline Furniture',
  'Seaside Energy',
  'Summit Consulting',
];

export const DEMO_STATUS_LABEL: Record<DemoStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// A multiplicative hash (Knuth): the same index always gives the same number.
const hash = (n: number): number => Math.imul(n + 1, 2654435761) >>> 0;

const cache = new Map<number, DemoRow[]>();

/** `count` invoices; the same array for the same count (generated once). */
export function makeDemoRows(count: number): DemoRow[] {
  const cached = cache.get(count);
  if (cached) return cached;
  const rows = Array.from({ length: count }, (_, i): DemoRow => {
    const bucket = hash(i * 3 + 2) % 10;
    const day = hash(i * 5 + 1) % 270;
    return {
      id: `inv-${i + 1}`,
      number: `INV-${String(i + 1).padStart(6, '0')}`,
      supplier: SUPPLIERS[hash(i) % SUPPLIERS.length]!,
      date: new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10),
      amount: (5000 + (hash(i * 7 + 3) % 495000)) / 100,
      status: bucket < 5 ? 'pending' : bucket < 9 ? 'approved' : 'rejected',
    };
  });
  cache.set(count, rows);
  return rows;
}

/** `$1,234.50`, whatever the runtime locale. */
export const formatAmount = (value: number): string => `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
