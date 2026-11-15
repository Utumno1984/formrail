import { describe, expect, it } from 'vitest';
import { InvoiceNetworkError, InvoiceNotFoundError } from './invoice-store';
import { RecordNetworkError, RecordNotFoundError } from './record-store';

// #518: the errors of the invoices keep the name and the message they had before the generic store.
describe('the errors of the invoice store (#518)', () => {
  it('InvoiceNotFoundError: a RecordNotFoundError with the invoice noun, its own name and the id', () => {
    const error = new InvoiceNotFoundError('inv-x');
    expect(error).toBeInstanceOf(InvoiceNotFoundError);
    expect(error).toBeInstanceOf(RecordNotFoundError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvoiceNotFoundError');
    expect(error.message).toBe('Invoice "inv-x" not found');
    expect(error.id).toBe('inv-x');
  });

  it('InvoiceNetworkError: a RecordNetworkError with its own name, the default message or the given one', () => {
    const plain = new InvoiceNetworkError();
    expect(plain).toBeInstanceOf(InvoiceNetworkError);
    expect(plain).toBeInstanceOf(RecordNetworkError);
    expect(plain).toBeInstanceOf(Error);
    expect(plain.name).toBe('InvoiceNetworkError');
    expect(plain.message).toBe('Network error');
    const given = new InvoiceNetworkError('Could not save the invoice: network error');
    expect(given.name).toBe('InvoiceNetworkError');
    expect(given.message).toBe('Could not save the invoice: network error');
  });

  it('the base errors keep their own names (a subclass renaming itself never renames the base)', () => {
    expect(new RecordNotFoundError('x').name).toBe('RecordNotFoundError');
    expect(new RecordNotFoundError('x').message).toBe('Record "x" not found');
    expect(new RecordNetworkError().name).toBe('RecordNetworkError');
  });
});
