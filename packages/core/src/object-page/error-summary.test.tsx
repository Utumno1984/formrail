import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Field } from '../field/Field';
import { ValidationProvider } from '../field/ValidationContext';
import { Input } from '../input/Input';
import { getErrorSummary } from './error-summary';
import type { StandardSchemaLike } from './standard-schema';
import { ObjectPage } from './ObjectPage';
import { ObjectPageFooter } from './ObjectPageFooter';
import { ObjectPageSection } from './ObjectPageSection';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';
import { useObjectPageForm } from './use-object-page-form';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('getErrorSummary', () => {
  it('returns undefined without errors (empty object, only undefined values, empty formErrors)', () => {
    expect(getErrorSummary({})).toBeUndefined();
    expect(getErrorSummary({ a: undefined, 'address.city': undefined })).toBeUndefined();
    expect(getErrorSummary({}, { formErrors: [] })).toBeUndefined();
    expect(getErrorSummary({ a: undefined }, { formErrors: [] })).toBeUndefined();
  });

  it('English default: singular for one, plural otherwise', () => {
    expect(getErrorSummary({ supplier: 'Required' })).toBe('1 invalid field');
    expect(getErrorSummary({ supplier: 'Required', vat: 'Required' })).toBe('2 invalid fields');
    expect(getErrorSummary({ a: 'x', b: 'x', c: 'x', d: 'x', e: 'x', f: 'x', g: 'x', h: 'x', i: 'x', j: 'x', k: 'x' })).toBe(
      '11 invalid fields',
    );
  });

  it('ignores keys whose value is undefined, counts every other one (an empty message too)', () => {
    expect(getErrorSummary({ a: 'x', b: undefined, c: '' })).toBe('2 invalid fields');
  });

  it('counts nested and array paths one by one, with no control needed for them', () => {
    expect(getErrorSummary({ 'address.city': 'x', 'lines.0.qty': 'x', 'lines.10.qty': 'x' })).toBe('3 invalid fields');
  });

  it('adds formErrors to the count, also with no field error', () => {
    expect(getErrorSummary({ a: 'x' }, { formErrors: ['Root rule'] })).toBe('2 invalid fields');
    expect(getErrorSummary({}, { formErrors: ['Root rule'] })).toBe('1 invalid field');
    expect(getErrorSummary({ a: 'x', b: undefined }, { formErrors: ['One', 'Two'] })).toBe('3 invalid fields');
  });

  it('message replaces the text and receives the count, never called without errors', () => {
    const message = vi.fn((n: number) => (n === 1 ? '1 invalid field' : `${n} invalid fields`));
    expect(getErrorSummary({ a: 'x' }, { message })).toBe('1 invalid field');
    expect(getErrorSummary({ a: 'x' }, { formErrors: ['Root'], message })).toBe('2 invalid fields');
    expect(message.mock.calls).toEqual([[1], [2]]);
    expect(getErrorSummary({ a: undefined }, { formErrors: [], message })).toBeUndefined();
    expect(message).toHaveBeenCalledTimes(2);
  });

  it('does not read Object.prototype nor inherited keys', () => {
    const inherited = Object.create({ inherited: 'x' }) as Record<string, string>;
    expect(getErrorSummary(inherited)).toBeUndefined();
    expect(getErrorSummary({ constructor: 'x', toString: 'y' })).toBe('2 invalid fields');
  });

  it('does not change its arguments', () => {
    const errors = Object.freeze({ a: 'x', b: undefined });
    const formErrors = Object.freeze(['Root']);
    expect(getErrorSummary(errors, { formErrors })).toBe('2 invalid fields');
  });
});

// The rule of the levels, in one place: messages on the fields, the count in the footer's status
// region, the save error instead of the count when both exist.
type Values = { supplier: string; vat: string; region: string; internalCode: string };

const schema = z.object({
  supplier: z.string().trim().min(1, 'Supplier is required.'),
  vat: z.string().trim().min(1, 'VAT number is required.'),
  // Rendered as a locked Field: the focus cannot reach it.
  region: z.string().trim().min(1, 'Region is required.'),
  // No control on the page at all.
  internalCode: z.string().trim().min(1, 'Internal code is required.'),
});

const errorText = (error: unknown) => (error === null ? undefined : error instanceof Error ? error.message : String(error));

// Accepts anything: the save reaches the handler.
const lenient = z.object({});

function SupplierPage({
  baseline,
  failSave = false,
  rules = schema,
}: {
  baseline: Values;
  failSave?: boolean;
  rules?: StandardSchemaLike;
}) {
  const form = useObjectPageForm<Values>({ baseline, schema: rules });
  const ref = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef: ref, fieldErrors: form.fieldErrors });
  return (
    <div ref={ref}>
      <ValidationProvider fieldErrors={form.fieldErrors}>
        <ObjectPage>
          <ObjectPageFooter
            visible
            label="Save actions"
            message={errorText(form.saveError) ?? getErrorSummary(form.fieldErrors, { formErrors: form.formErrors })}
            messageTone="error"
          >
            <button
              type="button"
              onClick={() =>
                void form.save(() => {
                  if (failSave) throw new Error('The server is unreachable.');
                })
              }
            >
              Save
            </button>
          </ObjectPageFooter>
          <ObjectPageSection id="general" title="General">
            <Field label="Supplier" name="supplier">
              <Input value={form.values.supplier} onChange={(e) => form.setValue('supplier', e.target.value)} />
            </Field>
            <Field label="VAT number" name="vat">
              <Input value={form.values.vat} onChange={(e) => form.setValue('vat', e.target.value)} />
            </Field>
            <Field label="Region" name="region" state="locked" stateReason="Set by the head office.">
              <Input value={form.values.region} onChange={() => undefined} />
            </Field>
          </ObjectPageSection>
        </ObjectPage>
      </ValidationProvider>
    </div>
  );
}

const statusOf = () => screen.getByRole('region', { name: 'Save actions' }).querySelector('[role="status"]') as HTMLElement;

describe('getErrorSummary with useObjectPageForm and ObjectPageFooter', () => {
  it('counts every invalid path (locked field, path with no control); messages stay on the fields; the focus goes to the first focusable one', async () => {
    const user = userEvent.setup();
    render(<SupplierPage baseline={{ supplier: '', vat: '', region: '', internalCode: '' }} />);
    const status = statusOf();
    expect(status).toBeEmptyDOMElement();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    // Same node, now holding the count (the region was there before: announced politely).
    expect(statusOf()).toBe(status);
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Error: 4 invalid fields');
    expect(status).not.toHaveTextContent(/required/);
    expect(screen.getByText('Supplier is required.')).toBeInTheDocument();
    expect(screen.getByText('Region is required.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Supplier' })).toHaveFocus();

    await user.type(screen.getByRole('textbox', { name: 'Supplier' }), 'ACME');
    expect(status).toHaveTextContent('Error: 3 invalid fields');
    await user.type(screen.getByRole('textbox', { name: 'VAT number' }), 'IT1');
    // Left: the locked field and the path with no control, neither focusable.
    expect(status).toHaveTextContent('Error: 2 invalid fields');
  });

  it('only unreachable invalid paths: the summary is still there (it is their only announcement)', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<SupplierPage baseline={{ supplier: 'ACME', vat: 'IT1', region: '', internalCode: '' }} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(statusOf()).toHaveTextContent('Error: 2 invalid fields');
  });

  it('no error: no message, the status region stays mounted and empty', async () => {
    const user = userEvent.setup();
    render(<SupplierPage baseline={{ supplier: 'ACME', vat: 'IT1', region: 'North', internalCode: 'X1' }} />);
    const status = statusOf();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(statusOf()).toBe(status);
    expect(status).toBeEmptyDOMElement();
  });

  it('the save error wins over the summary when both exist; an edit clears the save error and the count comes back', async () => {
    const user = userEvent.setup();
    const empty: Values = { supplier: '', vat: 'IT1', region: 'North', internalCode: 'X1' };
    // Nothing to validate yet, rejected by the server: a saveError and no field error.
    const { rerender } = render(<SupplierPage failSave rules={lenient} baseline={empty} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(statusOf()).toHaveTextContent('Error: The server is unreachable.');

    // The rules tighten with no edit: the next save fails validation, which does not clear the
    // earlier saveError, so both exist at once and the footer shows only the save error.
    rerender(<SupplierPage failSave rules={schema} baseline={empty} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Supplier is required.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Supplier' })).toHaveFocus();
    expect(statusOf()).toHaveTextContent('Error: The server is unreachable.');
    expect(statusOf()).not.toHaveTextContent(/non valid/);

    // An edit clears the save error: the summary of what is left takes its place.
    await user.keyboard('A');
    expect(statusOf()).not.toHaveTextContent(/unreachable/);
    await user.clear(screen.getByRole('textbox', { name: 'Supplier' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(statusOf()).toHaveTextContent('Error: 1 invalid field');
  });
});
