import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Combobox, type ComboboxOption } from './Combobox';

// jsdom lacks what the positioning engine measures.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CITIES: ComboboxOption[] = [
  { value: 'mi', label: 'Milano' },
  { value: 'mo', label: 'Modena' },
  { value: 'mn', label: 'Mantova', disabled: true },
  { value: 'cdc', label: 'Città di Castello' },
  { value: 'to', label: 'Torino' },
];

function Controlled({
  onValueChange,
  initial,
  ...props
}: {
  onValueChange: (v: string | undefined) => void;
  initial?: string;
} & Partial<React.ComponentProps<typeof Combobox>>) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <Combobox
      options={CITIES}
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

describe('Combobox', () => {
  it('is a combobox named by the Field label, described by the Field messages, with a listbox in the DOM while closed', () => {
    render(
      <Field label="Comune" help="Sede legale" error="Obbligatorio" required>
        <Combobox options={CITIES} placeholder="Cerca un comune" />
      </Field>,
    );
    const input = screen.getByRole('combobox', { name: 'Comune' });
    expect(input).toHaveAccessibleDescription('Obbligatorio Sede legale');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('placeholder', 'Cerca un comune');
    const target = document.getElementById(input.getAttribute('aria-controls')!);
    expect(target).toHaveAttribute('role', 'listbox');
  });

  it('typing opens the list with the matching options only (diacritics-insensitive), and shows a non-option empty text', async () => {
    const user = userEvent.setup();
    render(<Combobox options={CITIES} aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'citta');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Città di Castello']);
    await user.clear(input);
    await user.type(input, 'zzz');
    // No selectable option: the only one is the disabled message.
    expect(screen.getAllByRole('option').map((o) => [o.textContent, o.getAttribute('aria-disabled')])).toEqual([
      ['No results', 'true'],
    ]);
  });

  it('arrows skip the disabled option, Enter picks once and the input shows the label; focus stays on the input', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'm');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(input);
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('Modena');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('mo');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('a click on an option selects it, closes the list, calls onValueChange once and keeps the focus on the input', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.click(screen.getByRole('option', { name: 'Torino' }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('to');
    expect(input).toHaveValue('Torino');
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Escape closes the list without selecting; Tab closes without selecting', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'mi');
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.type(input, 'l');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a selection outside the results stays: typing something else and leaving reverts the text with no call', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial="mi" aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('Milano');
    await user.clear(input);
    await user.type(input, 'xyz');
    await user.tab();
    expect(input).toHaveValue('Milano');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('clearOnEmpty: emptying and leaving calls onValueChange(undefined) once; without it the selection stays', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { unmount } = render(
      <Controlled onValueChange={onValueChange} initial="mi" clearOnEmpty aria-label="Comune" />,
    );
    await user.clear(screen.getByRole('combobox'));
    await user.tab();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole('combobox')).toHaveValue('');
    unmount();

    const other = vi.fn();
    render(<Controlled onValueChange={other} initial="mi" aria-label="Comune" />);
    await user.clear(screen.getByRole('combobox'));
    await user.tab();
    expect(other).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveValue('Milano');
  });

  it('no echo: a value changed by the parent (late options, undefined) never calls onValueChange and shows the label', async () => {
    const onValueChange = vi.fn();
    function Host({ options, value }: { options: ComboboxOption[]; value: string | undefined }) {
      return (
        <Combobox
          options={options}
          value={value}
          onValueChange={onValueChange}
          aria-label="Comune"
          placeholder="Cerca"
        />
      );
    }
    const { rerender } = render(<Host options={[]} value={undefined} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('');
    rerender(<Host options={[]} value="to" />);
    expect(input).toHaveValue('to');
    rerender(<Host options={CITIES} value="to" />);
    expect(input).toHaveValue('Torino');
    rerender(<Host options={CITIES} value={undefined} />);
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Cerca');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('an outside change while the user is typing does not overwrite the typed text; on leaving the new label shows', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Host({ value }: { value: string | undefined }) {
      return <Combobox options={CITIES} value={value} onValueChange={onValueChange} aria-label="Comune" />;
    }
    const { rerender } = render(<Host value="mi" />);
    const input = screen.getByRole('combobox');
    await user.clear(input);
    await user.type(input, 'tor');
    rerender(<Host value="mo" />);
    expect(input).toHaveValue('tor');
    await user.tab();
    expect(input).toHaveValue('Modena');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a value with no option shows unknownValueLabel or the raw value, and calls nothing', () => {
    const onValueChange = vi.fn();
    render(
      <>
        <Combobox
          options={CITIES}
          value="zz"
          unknownValueLabel="(non disponibile)"
          onValueChange={onValueChange}
          aria-label="A"
        />
        <Combobox options={CITIES} value="yy" onValueChange={onValueChange} aria-label="B" />
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'A' })).toHaveValue('(non disponibile)');
    expect(screen.getByRole('combobox', { name: 'B' })).toHaveValue('yy');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('an explicit emptyLabel (any language) replaces the English default', async () => {
    const user = userEvent.setup();
    render(<Combobox options={[]} emptyLabel="Nessun risultato" aria-label="Comune" />);
    await user.click(screen.getByRole('combobox'));
    // Scoped to the list: the live region next to the input carries the same text.
    expect(within(screen.getByRole('listbox')).getByText('Nessun risultato')).toBeInTheDocument();
    expect(screen.queryByText('No results')).toBeNull();
  });

  it('no results: the listbox owns only a disabled option with the message, never active nor selectable', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial="mi" aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'zzz');
    const list = screen.getByRole('listbox');
    expect(Array.from(list.children).map((el) => el.getAttribute('role'))).toEqual(['option']);
    const empty = screen.getByRole('option', { name: 'No results' });
    expect(empty).toHaveAttribute('aria-disabled', 'true');
    expect(empty).toHaveAttribute('aria-selected', 'false');
    expect(empty).not.toHaveAttribute('id');
    for (const key of ['{ArrowDown}', '{ArrowUp}', '{Home}', '{End}']) {
      await user.keyboard(key);
      expect(input).not.toHaveAttribute('aria-activedescendant');
      expect(empty).not.toHaveAttribute('data-active');
    }
    await user.keyboard('{Enter}');
    await user.click(empty);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveValue('zzz');
    // Results again: the message goes and the arrows reach the options.
    await user.clear(input);
    await user.type(input, 'mo');
    expect(screen.queryByRole('option', { name: 'No results' })).toBeNull();
    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Modena' }).id);
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('empty options: the list opens with the empty text, Enter does nothing, no crash', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox options={[]} onValueChange={onValueChange} aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    expect(within(screen.getByRole('listbox')).getByText('No results')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('options removed under an open list (the active one included) do not crash', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Combobox options={CITIES} aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'm');
    await user.keyboard('{ArrowDown}');
    rerender(<Combobox options={CITIES.slice(3)} aria-label="Comune" />);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('option', { name: 'Modena' })).toBeNull();
    await user.keyboard('{ArrowDown}');
  });

  it('two comboboxes have distinct listbox and option ids', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Combobox options={CITIES} aria-label="A" />
        <Combobox options={CITIES} aria-label="B" />
      </>,
    );
    const [a, b] = screen.getAllByRole('combobox');
    expect(a!.getAttribute('aria-controls')).not.toBe(b!.getAttribute('aria-controls'));
    await user.click(a!);
    const idsA = screen.getAllByRole('option').map((o) => o.id);
    await user.click(b!);
    expect(a).toHaveAttribute('aria-expanded', 'false');
    const idsB = screen.getAllByRole('option').map((o) => o.id);
    expect(idsA.some((id) => idsB.includes(id))).toBe(false);
  });

  describe('Field states', () => {
    it('disabled: not focusable, never opens', async () => {
      const user = userEvent.setup();
      render(
        <Field label="Comune" state="disabled" stateReason="Bozza">
          <Combobox options={CITIES} />
        </Field>,
      );
      const input = screen.getByRole('combobox', { name: 'Comune' });
      expect(input).toBeDisabled();
      await user.click(input);
      await user.tab();
      expect(document.activeElement).not.toBe(input);
      expect(screen.queryByRole('option')).toBeNull();
    });

    for (const state of ['forced', 'locked'] as const) {
      it(`${state}: focusable and readOnly, shows the value, never opens or changes, reason in aria-describedby`, async () => {
        const user = userEvent.setup();
        const onValueChange = vi.fn();
        render(
          <Field label="Comune" state={state} stateReason="Deciso dal contratto">
            <Combobox options={CITIES} value="mi" onValueChange={onValueChange} />
          </Field>,
        );
        const input = screen.getByRole('combobox', { name: 'Comune' });
        await user.tab();
        expect(document.activeElement).toBe(input);
        expect(input).toHaveAttribute('readonly');
        expect(input).toHaveAccessibleDescription('Deciso dal contratto');
        await user.keyboard('{ArrowDown}{ArrowUp}{Enter}tor');
        await user.click(input);
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('option')).toBeNull();
        expect(input).toHaveValue('Milano');
        expect(onValueChange).not.toHaveBeenCalled();
      });
    }

    it('a Field that becomes blocked while the list is open closes it, and it stays closed when unblocked', async () => {
      const user = userEvent.setup();
      function Host({ state }: { state: 'default' | 'locked' }) {
        const combobox = <Combobox options={CITIES} />;
        return state === 'default' ? (
          <Field label="Comune">{combobox}</Field>
        ) : (
          <Field label="Comune" state="locked" stateReason="x">
            {combobox}
          </Field>
        );
      }
      const { rerender } = render(<Host state="default" />);
      await user.click(screen.getByRole('combobox'));
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
      rerender(<Host state="locked" />);
      expect(screen.queryByRole('option')).toBeNull();
      rerender(<Host state="default" />);
      expect(screen.queryByRole('option')).toBeNull();
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('does not leak wrapper props onto the DOM and className on the input wins over the defaults', async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(
      <Combobox
        options={CITIES}
        aria-label="Comune"
        className="py-0 custom"
        size="sm"
        emptyLabel="Nulla"
        unknownValueLabel="?"
        clearOnEmpty
        filter={(options) => options}
        onValueChange={() => undefined}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const input = screen.getByRole('combobox');
    expect(input).toHaveClass('custom');
    expect(input).not.toHaveClass('py-[5px]');
    for (const name of ['options', 'emptylabel', 'unknownvaluelabel', 'clearonempty', 'size', 'filter']) {
      expect(container.querySelector(`[${name}]`)).toBeNull();
      expect(document.body.querySelector(`[${name}]`)).toBeNull();
    }
    expect(Array.from(input.attributes).map((a) => a.name)).not.toContain('onvaluechange');
    expect(error).not.toHaveBeenCalled();
  });

  it('IME: Enter during a composition does not select', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'mi');
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    await user.keyboard('{Enter}');
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('Combobox: "no results" live region', () => {
  const status = () => screen.getByRole('status');
  /** Records every change to the region's subtree (what a screen reader would react to). */
  const watch = (node: Element) => {
    // The callback drains the queue on its own microtask: count what it saw plus what is pending.
    let seen = 0;
    const observer = new MutationObserver((records) => {
      seen += records.length;
    });
    observer.observe(node, { childList: true, characterData: true, subtree: true, attributes: true });
    return {
      count: () => (seen += observer.takeRecords().length),
      stop: () => observer.disconnect(),
    };
  };

  it('is mounted, polite, atomic, visually hidden and empty before any interaction', () => {
    render(
      <Field label="Comune">
        <Combobox options={CITIES} />
      </Field>,
    );
    const region = status();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toHaveClass('sr-only');
    expect(region).toHaveTextContent(/^$/u);
    expect(region).not.toHaveAttribute('id');
    expect(region).not.toHaveAttribute('hidden');
    // Not part of the listbox: a listbox may own only options.
    expect(region.closest('[role="listbox"]')).toBeNull();
  });

  it('the same node gets the message when typing empties the results, and is emptied when results return', async () => {
    const user = userEvent.setup();
    render(<Combobox options={CITIES} aria-label="Comune" />);
    const region = status();
    const input = screen.getByRole('combobox');
    await user.type(input, 'mi');
    expect(region).toHaveTextContent(/^$/u);
    await user.type(input, 'zz');
    expect(status()).toBe(region);
    expect(region).toHaveTextContent(/^No results$/u);
    await user.clear(input);
    await user.type(input, 'mo');
    expect(status()).toBe(region);
    expect(region).toHaveTextContent(/^$/u);
    expect(screen.getByRole('option', { name: 'Modena' })).toBeInTheDocument();
  });

  it('keystrokes that keep the "no results" state do not touch the region (no repeated announcement)', async () => {
    const user = userEvent.setup();
    render(<Combobox options={CITIES} aria-label="Comune" />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'z');
    const region = status();
    expect(region).toHaveTextContent('No results');
    const changes = watch(region);
    await user.type(input, 'zzqx');
    await user.keyboard('{Backspace}{Backspace}{ArrowDown}{ArrowUp}{Home}{End}');
    expect(input).toHaveValue('zzz');
    expect(changes.count()).toBe(0);
    // A real transition out and back in is a new announcement.
    await user.clear(input);
    await user.type(input, 'to');
    expect(region).toHaveTextContent(/^$/u);
    await user.type(input, 'x');
    expect(region).toHaveTextContent('No results');
    expect(changes.count()).toBeGreaterThan(0);
    changes.stop();
  });

  it('keystrokes among results never touch the region, and aria-activedescendant works as before', async () => {
    const user = userEvent.setup();
    render(<Combobox options={CITIES} aria-label="Comune" />);
    const region = status();
    const changes = watch(region);
    const input = screen.getByRole('combobox');
    await user.type(input, 'm');
    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Modena' }).id);
    expect(changes.count()).toBe(0);
    changes.stop();
  });

  it('uses emptyLabel, and the message option itself is not a live region (read once)', async () => {
    const user = userEvent.setup();
    render(<Combobox options={CITIES} emptyLabel="Nessun risultato" aria-label="Comune" />);
    await user.type(screen.getByRole('combobox'), 'zzz');
    expect(status()).toHaveTextContent(/^Nessun risultato$/u);
    const list = screen.getByRole('listbox');
    expect(list.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(list.closest('[aria-live]')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('closing the list (Escape, Tab) empties the region; reopening on the same text announces again', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Combobox options={CITIES} aria-label="Comune" />
        <button type="button">After</button>
      </>,
    );
    const input = screen.getByRole('combobox');
    await user.type(input, 'zzz');
    expect(status()).toHaveTextContent('No results');
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(status()).toHaveTextContent(/^$/u);
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(status()).toHaveTextContent('No results');
    await user.tab();
    expect(status()).toHaveTextContent(/^$/u);
  });

  it('options arriving under an open empty list empty the region; options removed fill it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Combobox options={[]} aria-label="Comune" />);
    const region = status();
    await user.click(screen.getByRole('combobox'));
    expect(region).toHaveTextContent('No results');
    rerender(<Combobox options={CITIES} aria-label="Comune" />);
    expect(screen.getAllByRole('option')).toHaveLength(CITIES.length);
    expect(region).toHaveTextContent(/^$/u);
    rerender(<Combobox options={[]} aria-label="Comune" />);
    expect(region).toHaveTextContent('No results');
    expect(status()).toBe(region);
  });

  it('a blocked Field (forced, locked) never announces', async () => {
    const user = userEvent.setup();
    for (const state of ['forced', 'locked'] as const) {
      render(
        <Field label="Comune" state={state} stateReason="Deciso dal contratto.">
          <Combobox options={[]} />
        </Field>,
      );
      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.keyboard('{ArrowDown}');
      expect(status()).toHaveTextContent(/^$/u);
      cleanup();
    }
  });
});
