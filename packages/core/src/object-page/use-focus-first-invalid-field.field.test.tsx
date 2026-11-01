import { cleanup, render, screen } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Combobox } from '../combobox/Combobox';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { Select } from '../select/Select';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';

const OPTIONS = [
  { value: 'it', label: 'Italia' },
  { value: 'fr', label: 'Francia' },
];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Form({ errors, children }: { errors: Partial<Record<string, string>>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef: ref, fieldErrors: errors });
  return <div ref={ref}>{children}</div>;
}

describe('useFocusFirstInvalidField with Field name', () => {
  it('focuses an invalid Select (its trigger carries data-rop-name, never a native name)', () => {
    render(
      <Form errors={{ country: 'required' }}>
        <Field label="Nome" name="name">
          <Input />
        </Field>
        <Field label="Paese" name="country" error="required">
          <Select options={OPTIONS} />
        </Field>
      </Form>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Paese' });
    expect(trigger).toHaveAttribute('data-rop-name', 'country');
    expect(trigger).not.toHaveAttribute('name');
    expect(trigger).toHaveFocus();
  });

  it('picks the first invalid control in DOM order across Input, Select and Combobox', () => {
    render(
      <Form errors={{ c: 'x', b: 'x', a: 'x' }}>
        <Field label="A" name="a">
          <Input />
        </Field>
        <Field label="B" name="b">
          <Select options={OPTIONS} />
        </Field>
        <Field label="C" name="c">
          <Combobox options={OPTIONS} />
        </Field>
      </Form>,
    );
    expect(screen.getByRole('textbox', { name: 'A' })).toHaveFocus();
  });

  it('reaches Select and Combobox when they are the only invalid ones', () => {
    const { rerender } = render(
      <Form errors={{ c: 'x', b: 'x' }}>
        <Field label="A" name="a">
          <Input />
        </Field>
        <Field label="B" name="b">
          <Select options={OPTIONS} />
        </Field>
        <Field label="C" name="c">
          <Combobox options={OPTIONS} />
        </Field>
      </Form>,
    );
    expect(screen.getByRole('combobox', { name: 'B' })).toHaveFocus();
    rerender(
      <Form errors={{ c: 'x' }}>
        <Field label="A" name="a">
          <Input />
        </Field>
        <Field label="B" name="b">
          <Select options={OPTIONS} />
        </Field>
        <Field label="C" name="c">
          <Combobox options={OPTIONS} />
        </Field>
      </Form>,
    );
    expect(screen.getByRole('combobox', { name: 'C' })).toHaveFocus();
  });

  it('skips a disabled invalid Select and goes to the next one', () => {
    render(
      <Form errors={{ a: 'x', b: 'x' }}>
        <Field label="A" name="a" state="disabled">
          <Select options={OPTIONS} />
        </Field>
        <Field label="B" name="b">
          <Input />
        </Field>
      </Form>,
    );
    expect(screen.getByRole('textbox', { name: 'B' })).toHaveFocus();
  });

  it('focuses a locked invalid Select (focusable, read-only)', () => {
    render(
      <Form errors={{ a: 'x' }}>
        <Field label="A" name="a" state="locked" stateReason="Bloccato">
          <Select options={OPTIONS} />
        </Field>
      </Form>,
    );
    expect(screen.getByRole('combobox', { name: 'A' })).toHaveFocus();
  });

  it('with two Fields of the same name the first in DOM order wins, without errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Form errors={{ dup: 'x' }}>
        <Field label="Uno" name="dup">
          <Input />
        </Field>
        <Field label="Due" name="dup">
          <Input />
        </Field>
      </Form>,
    );
    expect(screen.getByRole('textbox', { name: 'Uno' })).toHaveFocus();
    expect(error).not.toHaveBeenCalled();
  });

  it('falls back on a native [name] for controls that only have a name', () => {
    render(
      <Form errors={{ plain: 'x' }}>
        <Field label="Plain">{(control) => <input {...control} name="plain" data-rop-name={undefined} />}</Field>
      </Form>,
    );
    expect(screen.getByRole('textbox', { name: 'Plain' })).toHaveFocus();
  });

  it('a render-prop control that does not spread data-rop-name is found by [name] or reported in dev', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Form errors={{ lost: 'x' }}>
        <Field label="Lost" name="lost">
          {(control) => <input id={control.id} aria-labelledby={control['aria-labelledby']} />}
        </Field>
      </Form>,
    );
    expect(screen.getByRole('textbox', { name: 'Lost' })).not.toHaveFocus();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
