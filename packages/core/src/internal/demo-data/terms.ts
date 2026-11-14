// Payment terms shared by customers and suppliers: an invoice is due `days` after its issue date.

export type DemoPaymentTerms = 'due-on-receipt' | 'net-15' | 'net-30' | 'net-45' | 'net-60';

export const PAYMENT_TERMS_DAYS: Readonly<Record<DemoPaymentTerms, number>> = Object.freeze({
  'due-on-receipt': 0,
  'net-15': 15,
  'net-30': 30,
  'net-45': 45,
  'net-60': 60,
});

export const PAYMENT_TERMS_LABEL: Readonly<Record<DemoPaymentTerms, string>> = Object.freeze({
  'due-on-receipt': 'Due on receipt',
  'net-15': 'Net 15 days',
  'net-30': 'Net 30 days',
  'net-45': 'Net 45 days',
  'net-60': 'Net 60 days',
});
