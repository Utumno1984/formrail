import { useState, type ButtonHTMLAttributes } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../input/Input';
import { Field } from './Field';
import type { FieldControlProps } from './FieldContext';
import { useFieldControl } from './useFieldControl';

function describedIds(el: HTMLElement): string[] {
  return (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
}

/** Custom switch: a native button that refuses changes when the Field blocks interaction. */
function Toggle({ control, ...rest }: { control: FieldControlProps } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [on, setOn] = useState(false);
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        if (!control.interactionBlocked) setOn((v) => !v);
      }}
    />
  );
}

describe('Field', () => {
  it('names the input after the label, through a generated id or the id prop', () => {
    const { rerender } = render(
      <Field label="Ragione sociale">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Ragione sociale' });
    expect(screen.getByLabelText('Ragione sociale')).toBe(input);
    expect(input.id).not.toBe('');
    expect(screen.getByText('Ragione sociale').closest('label')).toHaveAttribute('for', input.id);

    rerender(
      <Field label="Ragione sociale" id="rs">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Ragione sociale').id).toBe('rs');
  });

  it('keeps htmlFor and aria-describedby coherent when the id prop changes after mount', () => {
    const { rerender } = render(
      <Field label="Nome" id="a" help="Aiuto">
        <Input />
      </Field>,
    );
    rerender(
      <Field label="Nome" id="b" help="Aiuto">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Nome' });
    expect(input.id).toBe('b');
    expect(screen.getByText('Nome').closest('label')).toHaveAttribute('for', 'b');
    expect(describedIds(input)).toEqual(['b-help']);
    expect(document.getElementById('b-help')).toHaveTextContent('Aiuto');
  });

  it('gives two Fields with the same label distinct ids', () => {
    render(
      <>
        <Field label="Nome">
          <Input />
        </Field>
        <Field label="Nome">
          <Input />
        </Field>
      </>,
    );
    const [a, b] = screen.getAllByRole('textbox', { name: 'Nome' });
    expect(a?.id).not.toBe(b?.id);
  });

  it('lists exactly the rendered messages in aria-describedby: reason, error, help', () => {
    render(
      <Field label="Nome" state="locked" stateReason="Gestito dall'amministratore" error="Obbligatorio" help="Aiuto">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Nome' });
    const ids = describedIds(input);
    expect(ids).toHaveLength(3);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "Gestito dall'amministratore",
      'Obbligatorio',
      'Aiuto',
    ]);
    expect(input).toHaveAccessibleDescription("Gestito dall'amministratore Obbligatorio Aiuto");
  });

  it('has no aria-describedby when nothing is rendered, and never points to a missing node', () => {
    const { rerender } = render(
      <Field label="Nome" help="  " error={null}>
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
    rerender(
      <Field label="Nome" help="Aiuto" error="Err">
        <Input />
      </Field>,
    );
    for (const id of describedIds(screen.getByRole('textbox'))) expect(document.getElementById(id)).not.toBeNull();
    rerender(
      <Field label="Nome" help="Aiuto">
        <Input />
      </Field>,
    );
    for (const id of describedIds(screen.getByRole('textbox'))) expect(document.getElementById(id)).not.toBeNull();
  });

  it('sets aria-invalid only while there is an error; an empty error counts as none', () => {
    const { rerender } = render(
      <Field label="Nome" error="Obbligatorio">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    rerender(
      <Field label="Nome" error="">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('hideLabel: the label is visually hidden but still names the input and is linked by for/id', () => {
    render(
      <Field label="Cerca" hideLabel>
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Cerca' });
    const label = screen.getByText('Cerca');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', input.id);
    expect(label.className).toContain('sr-only');
    // The visible label's margin (`mb-2`, was `mb-1` before #138) must not apply to the hidden one.
    expect(label.className).not.toMatch(/\bmb-\d/);
  });

  it('required: aria-required, a hidden marker, and the accessible name stays the label', () => {
    const { rerender } = render(
      <Field label="Ragione sociale" required>
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Ragione sociale' })).toHaveAttribute('aria-required', 'true');
    const marker = screen.getByText('*');
    expect(marker).toHaveAttribute('aria-hidden', 'true');
    rerender(
      <Field label="Ragione sociale">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Ragione sociale' })).not.toHaveAttribute('aria-required');
    rerender(
      <Field label="Ragione sociale" required state="forced" stateReason="Regola aziendale">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Ragione sociale' })).toBeInTheDocument();
  });

  it('disabled -> native disabled; forced and locked -> focusable readOnly with aria-readonly', () => {
    const { rerender } = render(
      <Field label="Nome" state="disabled" stateReason="Non disponibile">
        <Input />
      </Field>,
    );
    let input = screen.getByRole('textbox', { name: 'Nome' });
    expect(input).toBeDisabled();
    expect(describedIds(input)).toHaveLength(1);

    for (const state of ['forced', 'locked'] as const) {
      rerender(
        <Field label="Nome" state={state} stateReason="Motivo">
          <Input />
        </Field>,
      );
      input = screen.getByRole('textbox', { name: 'Nome' });
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('readonly');
      expect(input).toHaveAttribute('aria-readonly', 'true');
      expect(input).toHaveAccessibleDescription('Motivo');
      input.focus();
      expect(input).toHaveFocus();
    }
  });

  it('forced -> default after mount drops readOnly and the reason, keeping the current value', () => {
    const { rerender } = render(
      <Field label="Nome" state="forced" stateReason="Regola">
        <Input defaultValue="Acme" />
      </Field>,
    );
    rerender(
      <Field label="Nome">
        <Input defaultValue="Acme" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Nome' });
    expect(input).not.toHaveAttribute('readonly');
    expect(input).not.toHaveAttribute('aria-readonly');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Regola')).toBeNull();
    expect(input).toHaveValue('Acme');
  });

  it('a forced input ignores typing and Backspace and never calls onChange', async () => {
    const onChange = vi.fn();
    render(
      <Field label="Nome" state="forced" stateReason="Regola">
        <Input value="Acme" onChange={onChange} />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Nome' });
    await userEvent.type(input, 'xyz{Backspace}');
    expect(input).toHaveValue('Acme');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when value changes from outside', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Field label="Nome">
        <Input value="" onChange={onChange} />
      </Field>,
    );
    rerender(
      <Field label="Nome">
        <Input value="Caricato" onChange={onChange} />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toHaveValue('Caricato');
    expect(onChange).not.toHaveBeenCalled();
  });

  describe('render-prop and useFieldControl', () => {
    it('hands id, aria-describedby and the blocking flag to a custom control', async () => {
      render(
        <Field label="Attivo" state="locked" stateReason="Gestito dall'amministratore">
          {(control) => <Toggle control={control} {...control} />}
        </Field>,
      );
      const toggle = screen.getByRole('switch', { name: 'Attivo' });
      expect(toggle).toHaveAccessibleDescription("Gestito dall'amministratore");
      expect(toggle).toHaveAttribute('aria-readonly', 'true');
      // One gesture at a time: with an odd total a missing guard would flip the switch.
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      toggle.focus();
      await userEvent.keyboard(' ');
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      await userEvent.keyboard('{Enter}');
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('toggles when the Field is in the default state', async () => {
      render(<Field label="Attivo">{(control) => <Toggle control={control} {...control} />}</Field>);
      const toggle = screen.getByRole('switch', { name: 'Attivo' });
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('useFieldControl inside a child returns the same wiring', async () => {
      function Child() {
        const control = useFieldControl();
        return <Toggle control={control} {...control} />;
      }
      render(
        <Field label="Attivo" state="forced" stateReason="Regola">
          <Child />
        </Field>,
      );
      const toggle = screen.getByRole('switch', { name: 'Attivo' });
      expect(toggle).toHaveAccessibleDescription('Regola');
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('useFieldControl outside a Field throws an explicit error', () => {
      function Orphan() {
        useFieldControl();
        return null;
      }
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() => render(<Orphan />)).toThrow(/useFieldControl\(\) must be called inside a <Field>/);
      spy.mockRestore();
    });
  });

  describe('no leak on the DOM', () => {
    it('keeps state and interactionBlocked readable but not enumerable', () => {
      let captured: FieldControlProps | undefined;
      render(
        <Field label="X" state="locked" stateReason="Motivo" error="E" required>
          {(control) => {
            captured = control;
            return <input {...control} />;
          }}
        </Field>,
      );
      expect(captured?.state).toBe('locked');
      expect(captured?.interactionBlocked).toBe(true);
      expect(Object.keys(captured ?? {})).not.toContain('state');
      expect(Object.keys(captured ?? {})).not.toContain('interactionBlocked');
      expect({ ...captured }).not.toHaveProperty('state');
      expect({ ...captured }).not.toHaveProperty('interactionBlocked');
    });

    it('spreading the control on a native <input> logs no React warning and adds exactly the valid attributes', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { container } = render(
        <Field label="X" state="forced" stateReason="Motivo" error="E" help="H" required>
          {(c) => <input {...c} />}
        </Field>,
      );
      const el = container.querySelector('input') as HTMLElement;
      expect(
        Array.from(el.attributes)
          .map((a) => a.name)
          .sort(),
      ).toEqual(
        ['aria-describedby', 'aria-invalid', 'aria-labelledby', 'aria-readonly', 'aria-required', 'id', 'readonly'].sort(),
      );
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('spreading the control on any element logs no React warning (the non-DOM keys do not travel)', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      render(
        <Field label="X" state="locked" stateReason="Motivo">
          {(c) => <button {...c} />}
        </Field>,
      );
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('names a non-labelable custom control (div role=switch) through aria-labelledby, without the required marker', () => {
      render(
        <Field label="Attivo" required state="locked" stateReason="Motivo">
          {(c) => <div role="switch" tabIndex={0} aria-checked="false" id={c.id} aria-labelledby={c['aria-labelledby']} aria-describedby={c['aria-describedby']} />}
        </Field>,
      );
      const sw = screen.getByRole('switch', { name: 'Attivo' });
      expect(sw).toHaveAccessibleDescription('Motivo');
    });
  });
});

describe('keyboard-safe focus', () => {
  type Listener = () => void;
  function installVisualViewport(initial: { height: number; offsetTop?: number }) {
    const listeners = new Set<Listener>();
    const vv = {
      height: initial.height,
      offsetTop: initial.offsetTop ?? 0,
      scale: 1,
      addEventListener: (_t: string, l: Listener) => listeners.add(l),
      removeEventListener: (_t: string, l: Listener) => listeners.delete(l),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    return { vv, fire: () => listeners.forEach((l) => l()), count: () => listeners.size };
  }

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
    document.documentElement.style.removeProperty('--rop-keyboard-inset');
  });

  it('publishes the covered height, scrolls a hidden field into view on resize, and cleans up on blur', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const { vv, fire, count } = installVisualViewport({ height: 800 });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <>
        <Field label="Nome">
          <Input />
        </Field>
        <button>altro</button>
      </>,
    );
    const input = screen.getByRole('textbox');
    const field = input.closest('[data-state]') as HTMLElement;
    // The field sits at y=600..650, in the area a 300px keyboard will cover.
    field.getBoundingClientRect = () => ({ top: 600, bottom: 650 }) as DOMRect;
    act(() => input.focus());
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--rop-keyboard-inset')).toBe('0px');

    vv.height = 500;
    act(() => fire());
    expect(document.documentElement.style.getPropertyValue('--rop-keyboard-inset')).toBe('300px');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });

    act(() => screen.getByRole('button').focus());
    expect(count()).toBe(0);
    expect(document.documentElement.style.getPropertyValue('--rop-keyboard-inset')).toBe('');
  });

  it('does not scroll a field that is already inside the visual viewport', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    installVisualViewport({ height: 500 });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <Field label="Nome">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox');
    (input.closest('[data-state]') as HTMLElement).getBoundingClientRect = () => ({ top: 100, bottom: 150 }) as DOMRect;
    act(() => input.focus());
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('stops listening when the focused control is unmounted without a blur', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const { fire, count } = installVisualViewport({ height: 800 });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    function Demo({ show }: { show: boolean }) {
      return <Field label="Nome">{show ? <Input /> : <span />}</Field>;
    }
    const { rerender } = render(<Demo show />);
    act(() => screen.getByRole('textbox').focus());
    expect(count()).toBe(1);
    rerender(<Demo show={false} />);
    act(() => fire());
    expect(count()).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--rop-keyboard-inset')).toBe('');
  });

  it('does nothing while the page is pinch-zoomed (scale is not 1)', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const { vv, fire } = installVisualViewport({ height: 400 });
    vv.scale = 2;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <Field label="Nome">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox');
    (input.closest('[data-state]') as HTMLElement).getBoundingClientRect = () => ({ top: 700, bottom: 750 }) as DOMRect;
    act(() => input.focus());
    act(() => fire());
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--rop-keyboard-inset')).toBe('');
  });

  it('is a no-op where visualViewport does not exist', () => {
    render(
      <Field label="Nome">
        <Input />
      </Field>,
    );
    expect(() => act(() => screen.getByRole('textbox').focus())).not.toThrow();
  });
});

describe('Field message area', () => {
  it('always renders the reserved area, empty and silent when there is no message', () => {
    const { container } = render(
      <Field label="Nome">
        <Input />
      </Field>,
    );
    const area = container.querySelector('[data-field-error-slot]') as HTMLElement;
    expect(area).not.toBeNull();
    expect(area).toBeEmptyDOMElement();
    expect(area.className).toContain('min-h-[calc(var(--text-rop-caption--line-height)+0.25rem)]');
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
  });

  it('keeps the error slot reserved when the Field also has a reason and help', () => {
    const { container } = render(
      <Field label="Nome" state="locked" stateReason="Locked." help="Hint.">
        <Input />
      </Field>,
    );
    const slot = container.querySelector('[data-field-error-slot]') as HTMLElement;
    expect(slot).toBeEmptyDOMElement();
    expect(slot.className).toContain('min-h-');
  });

  it('reserveMessageSpace={false} takes no room when there is no message', () => {
    const { container } = render(
      <Field label="Search" hideLabel reserveMessageSpace={false}>
        <Input />
      </Field>,
    );
    expect((container.querySelector('[data-field-error-slot]') as HTMLElement).className).toBe('');
  });

  it('renders the error inside the slot; reason and help stay outside it, in the same order', () => {
    const { container } = render(
      <Field label="Nome" state="locked" stateReason="Locked." error="Bad." help="Hint.">
        <Input />
      </Field>,
    );
    const slot = container.querySelector('[data-field-error-slot]') as HTMLElement;
    expect(slot.children).toHaveLength(1);
    expect(slot).toHaveTextContent('Bad.');
    // Visual order: reason and help next to the control, the reserved error slot last.
    const field = slot.parentElement as HTMLElement;
    const order = Array.from(field.children).map((el) => el.id || (el as HTMLElement).dataset.fieldErrorSlot);
    expect(order.slice(-3)).toEqual([expect.stringMatching(/-reason$/), expect.stringMatching(/-help$/), '']);
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Locked. Bad. Hint.');
  });
});
