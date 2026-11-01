import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { memo, useContext, useRef, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox } from '../combobox/Combobox';
import { Input } from '../input/Input';
import type { FieldErrors } from '../object-page/field-errors';
import { useFocusFirstInvalidField } from '../object-page/use-focus-first-invalid-field';
import { useObjectPageForm } from '../object-page/use-object-page-form';
import { Select } from '../select/Select';
import { Field } from './Field';
import { useFieldControl } from './useFieldControl';
import { ValidationContext, ValidationProvider } from './ValidationContext';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const OPTIONS = [{ value: 'it', label: 'Italy' }];

/** The error message node the control points to, or null. */
function errorOf(control: HTMLElement): HTMLElement | null {
  const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  const errorId = ids.find((id) => id.endsWith('-error'));
  return errorId ? document.getElementById(errorId) : null;
}

function expectInvalid(control: HTMLElement, message: string) {
  expect(control).toHaveAttribute('aria-invalid', 'true');
  const node = errorOf(control);
  expect(node).not.toBeNull();
  expect(node).toHaveTextContent(message);
  expect(control).toHaveAccessibleDescription(expect.stringContaining(message));
}

function expectValid(control: HTMLElement) {
  expect(control).not.toHaveAttribute('aria-invalid');
  expect(errorOf(control)).toBeNull();
}

describe('ValidationProvider', () => {
  it('renders no DOM of its own', () => {
    const { container } = render(
      <ValidationProvider fieldErrors={{ a: 'x' }}>
        <span data-testid="child" />
      </ValidationProvider>,
    );
    expect(container.innerHTML).toBe('<span data-testid="child"></span>');
  });

  it('a Field with name shows fieldErrors[name], rendered exactly like the error prop', () => {
    const explicit = render(
      <Field label="Supplier" id="s" name="supplier" error="Supplier is required">
        <Input />
      </Field>,
    ).container.innerHTML;
    cleanup();
    const { container } = render(
      <ValidationProvider fieldErrors={{ supplier: 'Supplier is required' }}>
        <Field label="Supplier" id="s" name="supplier">
          <Input />
        </Field>
      </ValidationProvider>,
    );
    expect(container.innerHTML).toBe(explicit);
    expectInvalid(screen.getByRole('textbox', { name: 'Supplier' }), 'Supplier is required');
  });

  it('an absent key or undefined: no error, no warning', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ValidationProvider fieldErrors={{ b: undefined }}>
        <Field label="A" name="a">
          <Input />
        </Field>
        <Field label="B" name="b">
          <Input />
        </Field>
      </ValidationProvider>,
    );
    for (const name of ['A', 'B']) {
      const control = screen.getByRole('textbox', { name });
      expectValid(control);
      expect(control).not.toHaveAttribute('aria-describedby');
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('an empty or blank message is invalid like for the form (aria-invalid), with no message node and a dev error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ValidationProvider fieldErrors={{ c: '', d: '   ' }}>
        <Field label="C" name="c" help="Help C">
          <Input />
        </Field>
        <Field label="D" name="d">
          <Input />
        </Field>
      </ValidationProvider>,
    );
    const c = screen.getByRole('textbox', { name: 'C' });
    const d = screen.getByRole('textbox', { name: 'D' });
    for (const control of [c, d]) {
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(errorOf(control)).toBeNull();
    }
    // aria-describedby points only to nodes that exist: the help of C, nothing for D.
    expect(c.getAttribute('aria-describedby')).toMatch(/-help$/);
    expect(document.getElementById(c.getAttribute('aria-describedby')!)).not.toBeNull();
    expect(d).not.toHaveAttribute('aria-describedby');
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(consoleError.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('Field "c"'),
      expect.stringContaining('Field "d"'),
    ]);
  });

  it('the dev error is not repeated on re-renders with the same blank message, and stops when the message gets a text', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tree = (errors: FieldErrors) => (
      <ValidationProvider fieldErrors={errors}>
        <Field label="C" name="c">
          <Input />
        </Field>
      </ValidationProvider>
    );
    const { rerender } = render(tree({ c: '' }));
    rerender(tree({ c: '' }));
    rerender(tree({ c: ' ' }));
    expect(consoleError).toHaveBeenCalledTimes(1);
    rerender(tree({ c: 'C!' }));
    expectInvalid(screen.getByRole('textbox', { name: 'C' }), 'C!');
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('no dev error for a blank message in production', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    try {
      render(
        <ValidationProvider fieldErrors={{ c: '' }}>
          <Field label="C" name="c">
            <Input />
          </Field>
        </ValidationProvider>,
      );
      expect(screen.getByRole('textbox', { name: 'C' })).toHaveAttribute('aria-invalid', 'true');
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('an empty explicit error and a blank provider message: still invalid (the provider decides)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ValidationProvider fieldErrors={{ c: '' }}>
        <Field label="C" name="c" error="">
          <Input />
        </Field>
      </ValidationProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'C' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('a blank provider message on a path the form considers invalid: save blocked, focus and aria-invalid on the same field', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Element.prototype.scrollIntoView = vi.fn();
    function Blank() {
      const form = useObjectPageForm<{ c: string }>({ baseline: { c: '' }, validate: () => ({ c: '' }) });
      const ref = useRef<HTMLDivElement>(null);
      useFocusFirstInvalidField({ containerRef: ref, fieldErrors: form.fieldErrors });
      return (
        <div ref={ref}>
          <ValidationProvider fieldErrors={form.fieldErrors}>
            <Field label="C" name="c">
              <Input />
            </Field>
          </ValidationProvider>
          <button type="button" onClick={() => void form.save(() => undefined)}>
            Save
          </button>
        </div>
      );
    }
    render(<Blank />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    const c = screen.getByRole('textbox', { name: 'C' });
    expect(c).toHaveFocus();
    expect(c).toHaveAttribute('aria-invalid', 'true');
  });

  it('reaches Select, Combobox, a render-prop and useFieldControl alike', () => {
    function Probe() {
      const control = useFieldControl();
      return <output data-testid="probe">{String(control['aria-invalid'] ?? false)}</output>;
    }
    render(
      <ValidationProvider fieldErrors={{ b: 'B!', c: 'C!', r: 'R!', p: 'P!' }}>
        <Field label="B" name="b">
          <Select options={OPTIONS} />
        </Field>
        <Field label="C" name="c">
          <Combobox options={OPTIONS} />
        </Field>
        <Field label="R" name="r">
          {(control) => <input {...control} />}
        </Field>
        <Field label="P" name="p">
          <Probe />
        </Field>
      </ValidationProvider>,
    );
    expectInvalid(screen.getByRole('combobox', { name: 'B' }), 'B!');
    expectInvalid(screen.getByRole('combobox', { name: 'C' }), 'C!');
    expectInvalid(screen.getByRole('textbox', { name: 'R' }), 'R!');
    expect(screen.getByTestId('probe')).toHaveTextContent('true');
    expect(screen.getByText('P!')).toBeInTheDocument();
  });
});

describe('ValidationProvider: precedence of the explicit error', () => {
  it('an error with content wins over the provider', () => {
    render(
      <ValidationProvider fieldErrors={{ a: 'From the provider' }}>
        <Field label="A" name="a" error="Explicit">
          <Input />
        </Field>
        <Field label="B" name="a" error={<strong>Explicit markup</strong>}>
          <Input />
        </Field>
      </ValidationProvider>,
    );
    expectInvalid(screen.getByRole('textbox', { name: 'A' }), 'Explicit');
    expectInvalid(screen.getByRole('textbox', { name: 'B' }), 'Explicit markup');
    expect(screen.queryByText('From the provider')).not.toBeInTheDocument();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['false', false],
    ['an empty string', ''],
    ['a blank string', '   '],
    ['an empty Fragment', <></>],
  ])('an explicit error that is %s falls back to the provider', (_label, error) => {
    render(
      <ValidationProvider fieldErrors={{ a: 'From the provider' }}>
        <Field label="A" name="a" error={error}>
          <Input />
        </Field>
      </ValidationProvider>,
    );
    expectInvalid(screen.getByRole('textbox', { name: 'A' }), 'From the provider');
  });

  it('the explicit error appearing and going away switches between the two messages', () => {
    const tree = (error?: string) => (
      <ValidationProvider fieldErrors={{ a: 'From the provider' }}>
        <Field label="A" name="a" error={error}>
          <Input />
        </Field>
      </ValidationProvider>
    );
    const { rerender } = render(tree());
    const control = screen.getByRole('textbox', { name: 'A' });
    expectInvalid(control, 'From the provider');
    rerender(tree('Explicit'));
    expectInvalid(control, 'Explicit');
    expect(screen.queryByText('From the provider')).not.toBeInTheDocument();
    rerender(tree(''));
    expectInvalid(control, 'From the provider');
  });
});

describe('ValidationProvider: scope', () => {
  it('a Field without name (or with an empty name) ignores the provider', () => {
    render(
      <ValidationProvider fieldErrors={{ '': 'Empty key', a: 'A!' }}>
        <Field label="No name">
          <Input />
        </Field>
        <Field label="Empty name" name="">
          <Input />
        </Field>
      </ValidationProvider>,
    );
    expectValid(screen.getByRole('textbox', { name: 'No name' }));
    expectValid(screen.getByRole('textbox', { name: 'Empty name' }));
  });

  it('a Field with name outside any provider has no error, and the error prop still works', () => {
    render(
      <>
        <Field label="A" name="a">
          <Input />
        </Field>
        <Field label="B" name="b" error="B!">
          <Input />
        </Field>
      </>,
    );
    expectValid(screen.getByRole('textbox', { name: 'A' }));
    expectInvalid(screen.getByRole('textbox', { name: 'B' }), 'B!');
  });

  it('a Field next to (not inside) a provider is not affected', () => {
    render(
      <>
        <ValidationProvider fieldErrors={{ a: 'A!' }}>
          <span />
        </ValidationProvider>
        <Field label="A" name="a">
          <Input />
        </Field>
      </>,
    );
    expectValid(screen.getByRole('textbox', { name: 'A' }));
  });

  it('nested providers: the innermost is the only source (no merge with the outer one)', () => {
    render(
      <ValidationProvider fieldErrors={{ a: 'Outer A', b: 'Outer B' }}>
        <Field label="Outer field" name="a">
          <Input />
        </Field>
        <ValidationProvider fieldErrors={{ a: 'Inner A' }}>
          <Field label="Inner A" name="a">
            <Input />
          </Field>
          <Field label="Inner B" name="b">
            <Input />
          </Field>
        </ValidationProvider>
      </ValidationProvider>,
    );
    expectInvalid(screen.getByRole('textbox', { name: 'Outer field' }), 'Outer A');
    expectInvalid(screen.getByRole('textbox', { name: 'Inner A' }), 'Inner A');
    expectValid(screen.getByRole('textbox', { name: 'Inner B' }));
    expect(screen.queryByText('Outer B')).not.toBeInTheDocument();
  });

  it('nested paths match exactly, never by prefix', () => {
    render(
      <ValidationProvider fieldErrors={{ 'address.city': 'City!', 'lines.10.qty': 'Ten!' }}>
        <Field label="Address" name="address">
          <Input />
        </Field>
        <Field label="City" name="address.city">
          <Input />
        </Field>
        <Field label="Zip" name="address.city.zip">
          <Input />
        </Field>
        <Field label="Qty 1" name="lines.1.qty">
          <Input />
        </Field>
        <Field label="Qty 10" name="lines.10.qty">
          <Input />
        </Field>
      </ValidationProvider>,
    );
    expectValid(screen.getByRole('textbox', { name: 'Address' }));
    expectInvalid(screen.getByRole('textbox', { name: 'City' }), 'City!');
    expectValid(screen.getByRole('textbox', { name: 'Zip' }));
    expectValid(screen.getByRole('textbox', { name: 'Qty 1' }));
    expectInvalid(screen.getByRole('textbox', { name: 'Qty 10' }), 'Ten!');
  });

  it('a name like "constructor" never reads Object.prototype', () => {
    render(
      <ValidationProvider fieldErrors={{}}>
        <Field label="Ctor" name="constructor">
          <Input />
        </Field>
        <Field label="ToString" name="toString">
          <Input />
        </Field>
      </ValidationProvider>,
    );
    expectValid(screen.getByRole('textbox', { name: 'Ctor' }));
    expectValid(screen.getByRole('textbox', { name: 'ToString' }));
  });

  it('a name changed dynamically reads the new path (and data-rop-name follows)', () => {
    const tree = (name: string) => (
      <ValidationProvider fieldErrors={{ a: 'A!', b: 'B!' }}>
        <Field label="X" name={name}>
          <Input />
        </Field>
      </ValidationProvider>
    );
    const { rerender } = render(tree('a'));
    const control = screen.getByRole('textbox', { name: 'X' });
    expectInvalid(control, 'A!');
    rerender(tree('b'));
    expectInvalid(control, 'B!');
    expect(control).toHaveAttribute('data-rop-name', 'b');
    expect(screen.queryByText('A!')).not.toBeInTheDocument();
    rerender(tree('c'));
    expectValid(control);
    expect(control).toHaveAttribute('data-rop-name', 'c');
  });
});

describe('ValidationProvider: dynamic errors and field states', () => {
  it('an error appearing and going away while the control has the focus keeps aria-describedby coherent', () => {
    const tree = (errors: FieldErrors) => (
      <ValidationProvider fieldErrors={errors}>
        <Field label="A" name="a" help="Help text">
          <Input />
        </Field>
      </ValidationProvider>
    );
    const { rerender } = render(tree({}));
    const control = screen.getByRole('textbox', { name: 'A' });
    act(() => control.focus());
    const helpOnly = control.getAttribute('aria-describedby');
    expect(helpOnly).toMatch(/-help$/);
    expect(control).toHaveAccessibleDescription('Help text');

    rerender(tree({ a: 'A!' }));
    expect(control).toHaveFocus();
    expect(control.getAttribute('aria-describedby')).toBe(`${helpOnly!.replace(/-help$/, '-error')} ${helpOnly}`);
    expect(control).toHaveAccessibleDescription('A! Help text');

    rerender(tree({}));
    expect(control).toHaveFocus();
    expect(control.getAttribute('aria-describedby')).toBe(helpOnly);
    expect(control).not.toHaveAttribute('aria-invalid');
    for (const id of control.getAttribute('aria-describedby')!.split(' ')) expect(document.getElementById(id)).not.toBeNull();
  });

  it.each(['forced', 'locked'] as const)('%s: the provider error is shown, after the reason, the control stays read-only', (state) => {
    render(
      <ValidationProvider fieldErrors={{ vat: 'VAT number is invalid' }}>
        <Field label="VAT" name="vat" state={state} stateReason="Set by the tax rule">
          <Input defaultValue="IT000" />
        </Field>
      </ValidationProvider>,
    );
    const control = screen.getByRole('textbox', { name: 'VAT' });
    expectInvalid(control, 'VAT number is invalid');
    expect(screen.getByText('VAT number is invalid')).toBeVisible();
    expect(control).toHaveAttribute('readonly');
    expect(control).toHaveAccessibleDescription('Set by the tax rule VAT number is invalid');
    const ids = control.getAttribute('aria-describedby')!.split(' ');
    expect(ids.map((id) => id.replace(/^.*-/, ''))).toEqual(['reason', 'error']);
  });

  it('disabled: the provider error is shown and the control stays disabled', () => {
    render(
      <ValidationProvider fieldErrors={{ vat: 'VAT number is invalid' }}>
        <Field label="VAT" name="vat" state="disabled">
          <Input />
        </Field>
      </ValidationProvider>,
    );
    const control = screen.getByRole('textbox', { name: 'VAT' });
    expectInvalid(control, 'VAT number is invalid');
    expect(control).toBeDisabled();
  });
});

describe('ValidationProvider: identity and re-renders', () => {
  it('the context value is the fieldErrors object itself', () => {
    const errors: FieldErrors = { a: 'x' };
    const { result } = renderHook(() => useContext(ValidationContext), {
      wrapper: ({ children }: { children: ReactNode }) => <ValidationProvider fieldErrors={errors}>{children}</ValidationProvider>,
    });
    expect(result.current).toBe(errors);
  });

  it('a memoized subtree is not re-rendered while fieldErrors keeps its identity', () => {
    const renders = vi.fn();
    const Leaf = memo(function Leaf() {
      renders();
      return (
        <Field label="A" name="a">
          <Input />
        </Field>
      );
    });
    let bump: () => void = () => {};
    let replace: (e: FieldErrors) => void = () => {};
    function Host() {
      const [, setTick] = useState(0);
      const [errors, setErrors] = useState<FieldErrors>({ a: 'A!' });
      bump = () => setTick((t) => t + 1);
      replace = setErrors;
      return (
        <ValidationProvider fieldErrors={errors}>
          <Leaf />
        </ValidationProvider>
      );
    }
    render(<Host />);
    expect(renders).toHaveBeenCalledTimes(1);
    act(() => bump());
    act(() => bump());
    // The memoized Leaf does not re-render; the Field inside reads the context, which did not change.
    expect(renders).toHaveBeenCalledTimes(1);
    expectInvalid(screen.getByRole('textbox', { name: 'A' }), 'A!');
    act(() => replace({ a: 'A again' }));
    expectInvalid(screen.getByRole('textbox', { name: 'A' }), 'A again');
    // The Field updated through the context alone, without re-rendering the memoized parent.
    expect(renders).toHaveBeenCalledTimes(1);
  });
});

describe('ValidationProvider with useObjectPageForm', () => {
  type V = { supplier: string; city: string };

  function Demo() {
    const form = useObjectPageForm<V>({
      baseline: { supplier: '', city: '' },
      validate: (v) => ({
        supplier: v.supplier === '' ? 'Supplier is required' : undefined,
        city: v.city === '' ? 'City is required' : undefined,
      }),
    });
    return (
      <ValidationProvider fieldErrors={form.fieldErrors}>
        <Field label="Supplier" name="supplier">
          <Input value={form.values.supplier} onChange={(e) => form.setValue('supplier', e.target.value)} />
        </Field>
        <Field label="City" name="city">
          <Input value={form.values.city} onChange={(e) => form.setValue('city', e.target.value)} />
        </Field>
        <button type="button" onClick={() => void form.save(() => undefined)}>
          Save
        </button>
      </ValidationProvider>
    );
  }

  it('a failed save shows each message on its own Field; typing clears only the Field written (per path, #102)', async () => {
    render(<Demo />);
    const supplier = screen.getByRole('textbox', { name: 'Supplier' });
    const city = screen.getByRole('textbox', { name: 'City' });
    expectValid(supplier);
    expectValid(city);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expectInvalid(supplier, 'Supplier is required');
    expectInvalid(city, 'City is required');
    // #102: a setValue clears only the error of the field it writes; the other Field stays invalid.
    fireEvent.change(supplier, { target: { value: 'ACME' } });
    expectValid(supplier);
    expectInvalid(city, 'City is required');
    fireEvent.change(city, { target: { value: 'Rome' } });
    expectValid(supplier);
    expectValid(city);
  });
});
