import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Field, type FieldStateProps } from '../field/Field';
import { MultiSelect, type MultiSelectOption, type MultiSelectProps } from './MultiSelect';

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

const CENTERS: MultiSelectOption[] = [
  { value: 'adm', label: 'Administration' },
  { value: 'mkt', label: 'Marketing' },
  { value: 'ops', label: 'Operations', disabled: true },
  { value: 'rnd', label: 'Research' },
  { value: 'sal', label: 'Sales' },
];

function Controlled({
  onValueChange,
  initial = [],
  ...props
}: { onValueChange: (v: string[]) => void; initial?: string[] } & Partial<MultiSelectProps>) {
  const [value, setValue] = useState<readonly string[]>(initial);
  return (
    <MultiSelect
      aria-label="Cost centers"
      options={CENTERS}
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

const input = () => screen.getByRole('combobox');
const chips = () =>
  Array.from(document.querySelectorAll('[data-rop-multi-select] > span')).map((chip) => chip.textContent);
/** The chip's own text node (the same label is also in the hidden description). */
const chip = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-rop-multi-select] > span')).find(
    (el) => el.textContent === label,
  )!.firstElementChild as HTMLElement;
const optionNamed =(name: string) => within(screen.getByRole('listbox')).getByRole('option', { name });

describe('MultiSelect: ARIA', () => {
  it('is a combobox with a multiselectable listbox; options carry aria-selected true/false and a check on the selected ones', async () => {
    const user = userEvent.setup();
    render(<MultiSelect aria-label="Cost centers" options={CENTERS} defaultValue={['mkt']} />);
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).toHaveAttribute('aria-autocomplete', 'list');
    const target = document.getElementById(input().getAttribute('aria-controls')!);
    expect(target).toHaveAttribute('role', 'listbox');
    expect(target).toHaveAttribute('aria-multiselectable', 'true');
    await user.click(input());
    const list = screen.getByRole('listbox');
    expect(list).toHaveAttribute('aria-multiselectable', 'true');
    expect(input()).toHaveAttribute('aria-controls', list.id);
    expect(optionNamed('Marketing')).toHaveAttribute('aria-selected', 'true');
    expect(optionNamed('Marketing').querySelector('svg')).not.toBeNull();
    expect(optionNamed('Sales')).toHaveAttribute('aria-selected', 'false');
    expect(optionNamed('Sales').querySelector('svg')).toBeNull();
    await user.keyboard('{ArrowDown}');
    const active = input().getAttribute('aria-activedescendant');
    expect(document.getElementById(active!)).toHaveTextContent('Administration');
  });

  it('inside a Field: id, merged aria-describedby (Field first, then the selected labels), invalid, required, data-rop-name', () => {
    render(
      <Field label="Cost centers" help="Where the cost goes" error="Pick one" required name="centers">
        <MultiSelect options={CENTERS} defaultValue={['mkt', 'sal']} aria-describedby="own" />
      </Field>,
    );
    const box = screen.getByRole('combobox', { name: 'Cost centers' });
    expect(box.id).toBe(screen.getByText('Cost centers').closest('label')!.getAttribute('for'));
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAttribute('aria-required', 'true');
    expect(box).toHaveAttribute('data-rop-name', 'centers');
    expect(box).not.toHaveAttribute('name');
    document.body.insertAdjacentHTML('beforeend', '<span id="own">Own text</span>');
    expect(box).toHaveAccessibleDescription('Pick one Where the cost goes Own text Marketing, Sales');
    const ids = box.getAttribute('aria-describedby')!.split(' ');
    expect(ids.at(-2)).toBe('own');
    document.getElementById('own')!.remove();
  });

  it('forced: readOnly + aria-readonly, reason described; disabled: native disabled', () => {
    render(
      <>
        <Field label="Forced" state="forced" stateReason="Set by the contract.">
          <MultiSelect options={CENTERS} />
        </Field>
        <Field label="Disabled" state="disabled">
          <MultiSelect options={CENTERS} />
        </Field>
      </>,
    );
    const forced = screen.getByRole('combobox', { name: 'Forced' });
    expect(forced).toHaveAttribute('readonly');
    expect(forced).toHaveAttribute('aria-readonly', 'true');
    expect(forced).toHaveAccessibleDescription('Set by the contract.');
    expect(screen.getByRole('combobox', { name: 'Disabled' })).toBeDisabled();
  });

  it('no DOM leak of the non-DOM props, className on the box (merged), ref on the text input', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(
      <MultiSelect
        ref={ref}
        aria-label="Cost centers"
        options={CENTERS}
        defaultValue={['mkt']}
        unknownValueLabel={(v) => v}
        filter={(o) => o}
        labels={{ emptyLabel: 'Nothing' }}
        onValueChange={() => undefined}
        size="sm"
        className="px-5"
        data-testid="ms"
      />,
    );
    expect(ref.current).toBe(input());
    const html = container.innerHTML;
    for (const leaked of ['options', 'unknownvaluelabel', 'filter=', 'labels', 'onvaluechange', 'defaultvalue', 'size=']) {
      expect(html.toLowerCase()).not.toContain(leaked);
    }
    const box = container.querySelector('[data-rop-multi-select]')!;
    expect(box.className).toContain('px-5');
    expect(box.className.split(/\s+/)).not.toContain('px-3');
    expect(input()).toHaveAttribute('data-testid', 'ms');
  });
});

describe('MultiSelect: picking', () => {
  it('click toggles, calls onValueChange once per gesture, keeps the list open on the same active option and empties the filter', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.type(input(), 'mar');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Marketing']);
    await user.click(optionNamed('Marketing'));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith(['mkt']);
    expect(input()).toHaveValue('');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(CENTERS.length);
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)).toHaveTextContent('Marketing');
    expect(input()).toHaveFocus();
    await user.click(optionNamed('Sales'));
    expect(onValueChange).toHaveBeenLastCalledWith(['mkt', 'sal']);
    // Un-pick.
    await user.click(optionNamed('Marketing'));
    expect(onValueChange).toHaveBeenLastCalledWith(['sal']);
    expect(onValueChange).toHaveBeenCalledTimes(3);
    expect(chips()).toEqual(['Sales']);
  });

  it('Enter toggles the active option; the value is in selection order, not options order', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.type(input(), 'sal');
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith(['sal']);
    expect(input()).toHaveValue('');
    await user.keyboard('{Home}{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith(['sal', 'adm']);
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)).toHaveTextContent('Administration');
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith(['sal']);
    expect(onValueChange).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('arrows skip the disabled option; a click on it neither selects nor calls back', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)).toHaveTextContent('Research');
    await user.click(optionNamed('Operations'));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(optionNamed('Operations')).toHaveAttribute('aria-disabled', 'true');
    // The pointer over a disabled option does not make it active either.
    fireEvent.mouseMove(optionNamed('Operations'));
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)).toHaveTextContent('Research');
    expect(optionNamed('Operations')).toHaveAttribute('data-active', 'false');
  });

  it('a selected value on a disabled option stays a chip and can be removed', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial={['ops']} />);
    expect(chips()).toEqual(['Operations']);
    await user.click(screen.getByRole('button', { name: 'Remove Operations' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith([]);
    expect(input()).toHaveFocus();
  });
});

describe('MultiSelect: removing', () => {
  it('Backspace on an empty text removes the last chip; with text it only deletes text; the last removal gives []', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial={['mkt', 'sal']} />);
    await user.click(input());
    await user.keyboard('ab{Backspace}');
    expect(input()).toHaveValue('a');
    expect(onValueChange).not.toHaveBeenCalled();
    await user.keyboard('{Backspace}');
    expect(input()).toHaveValue('');
    expect(onValueChange).not.toHaveBeenCalled();
    await user.keyboard('{Backspace}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(['mkt']);
    await user.keyboard('{Backspace}');
    expect(onValueChange).toHaveBeenLastCalledWith([]);
    await user.keyboard('{Backspace}');
    expect(onValueChange).toHaveBeenCalledTimes(2);
  });

  it('remove buttons: distinct names, out of the tab order, the focus stays on the input', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial={['mkt', 'sal']} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Remove Marketing', 'Remove Sales']);
    for (const b of buttons) expect(b).toHaveAttribute('tabindex', '-1');
    await user.click(input());
    await user.click(screen.getByRole('button', { name: 'Remove Marketing' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(['sal']);
    expect(input()).toHaveFocus();
    // The list stays as it was (open) after a remove.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('a click on a chip (not on its button) focuses the input and removes nothing', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial={['mkt']} />);
    await user.click(chip('Marketing'));
    expect(input()).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(chips()).toEqual(['Marketing']);
  });

  it('custom labels name the remove buttons', () => {
    render(
      <MultiSelect
        aria-label="x"
        options={CENTERS}
        defaultValue={['mkt']}
        labels={{ removeValue: (label) => `Delete ${label}` }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete Marketing' })).toBeInTheDocument();
  });
});

describe('MultiSelect: closing', () => {
  it('Escape closes the list without touching the value; Tab closes and leaves without selecting', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <>
        <Controlled onValueChange={onValueChange} initial={['mkt']} />
        <button type="button">After</button>
      </>,
    );
    await user.type(input(), 'sa');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    // A second Escape empties the text.
    await user.keyboard('{Escape}');
    expect(input()).toHaveValue('');
    await user.type(input(), 'sa');
    await user.tab();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(input()).toHaveValue('');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(chips()).toEqual(['Marketing']);
  });
});

describe('MultiSelect: values outside the results', () => {
  it('a selected value hidden by the filter stays a chip; an unknown value uses unknownValueLabel and is removable', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Controlled onValueChange={onValueChange} initial={['mkt', 'gone']} unknownValueLabel={(v) => `(${v} removed)`} />,
    );
    expect(chips()).toEqual(['Marketing', '(gone removed)']);
    await user.type(input(), 'sal');
    expect(chips()).toEqual(['Marketing', '(gone removed)']);
    await user.click(screen.getByRole('button', { name: 'Remove (gone removed)' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(['mkt']);
  });

  it('an unknown value shows the raw value by default', () => {
    render(<MultiSelect aria-label="x" options={CENTERS} defaultValue={['zz']} />);
    expect(chips()).toEqual(['zz']);
  });
});

describe('MultiSelect: no echo (§1.13.1)', () => {
  const absent: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['[]', []],
  ];

  it.each(absent)('value=%s at mount and after the mount: zero callbacks, no chip', (_, v) => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <MultiSelect aria-label="x" options={CENTERS} value={v as string[]} onValueChange={onValueChange} />,
    );
    expect(chips()).toEqual([]);
    rerender(<MultiSelect aria-label="x" options={CENTERS} value={['mkt']} onValueChange={onValueChange} />);
    expect(chips()).toEqual(['Marketing']);
    rerender(<MultiSelect aria-label="x" options={CENTERS} value={v as string[]} onValueChange={onValueChange} />);
    expect(chips()).toEqual([]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it.each(absent)('value=%s (the key present) stays controlled after a user pick: one callback, no chip', async (_, v) => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<MultiSelect aria-label="x" options={CENTERS} value={v as string[]} onValueChange={onValueChange} />);
    await user.click(input());
    await user.click(optionNamed('Sales'));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(['sal']);
    expect(chips()).toEqual([]);
    expect(optionNamed('Sales')).toHaveAttribute('aria-selected', 'false');
  });

  it('missing value prop (uncontrolled) at mount and the defaultValue changing after: zero callbacks', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<MultiSelect aria-label="x" options={CENTERS} onValueChange={onValueChange} />);
    rerender(<MultiSelect aria-label="x" options={CENTERS} defaultValue={['mkt']} onValueChange={onValueChange} />);
    expect(chips()).toEqual([]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('options arriving after the mount turn the raw chips into labels without a callback; empty options show "No results"', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <MultiSelect aria-label="x" options={[]} value={['mkt', 'sal']} onValueChange={onValueChange} />,
    );
    expect(chips()).toEqual(['mkt', 'sal']);
    await user.click(input());
    expect(within(screen.getByRole('listbox')).getByRole('option')).toHaveTextContent('No results');
    rerender(<MultiSelect aria-label="x" options={CENTERS} value={['mkt', 'sal']} onValueChange={onValueChange} />);
    expect(chips()).toEqual(['Marketing', 'Sales']);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('duplicates in value: shown once, a dev warning, no echo; a removal emits the deduplicated rest', async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onValueChange = vi.fn();
    render(<MultiSelect aria-label="x" options={CENTERS} value={['mkt', 'mkt', 'sal']} onValueChange={onValueChange} />);
    expect(chips()).toEqual(['Marketing', 'Sales']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('duplicates');
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove Sales' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(['mkt']);
  });

  it('duplicate labels: distinct values stay distinct chips; a dev warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <MultiSelect
        aria-label="x"
        options={[
          { value: 'a', label: 'Same' },
          { value: 'b', label: 'Same' },
        ]}
        defaultValue={['a', 'b']}
      />,
    );
    expect(chips()).toEqual(['Same', 'Same']);
    expect(warn.mock.calls[0]![0]).toContain('share a `label`');
  });

  it('a controlled value the consumer does not update: the chips and the list reflect value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<MultiSelect aria-label="x" options={CENTERS} value={['mkt']} onValueChange={onValueChange} />);
    await user.click(input());
    await user.click(optionNamed('Sales'));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(['mkt', 'sal']);
    expect(chips()).toEqual(['Marketing']);
    expect(optionNamed('Sales')).toHaveAttribute('aria-selected', 'false');
  });

  it('uncontrolled: the picks are kept internally from defaultValue', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<MultiSelect aria-label="x" options={CENTERS} defaultValue={['mkt']} onValueChange={onValueChange} />);
    await user.click(input());
    await user.click(optionNamed('Sales'));
    expect(chips()).toEqual(['Marketing', 'Sales']);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(['mkt', 'sal']);
  });
});

describe('MultiSelect: IME composition (§1.13.5)', () => {
  it('while composing Enter does not pick, Backspace does not remove, Escape does not close; the filter follows the text', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial={['mkt']} />);
    await user.click(input());
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'sa' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Sales']);
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input(), { key: 'Escape', isComposing: true });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.keyDown(input(), { key: 'Backspace', isComposing: true });
    fireEvent.keyDown(input(), { key: 'Backspace', keyCode: 229 });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(chips()).toEqual(['Marketing']);
    fireEvent.compositionEnd(input());
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('keys between compositionstart and compositionend are ignored even without isComposing; so is the keyCode 229 keydown after compositionend', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial={['mkt']} />);
    await user.click(input());
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'sa' } });
    // Some engines report isComposing late: the composition flag of the component decides.
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input());
    // The final keydown some browsers fire after compositionend belongs to the composition.
    fireEvent.keyDown(input(), { key: 'Backspace', keyCode: 229 });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(chips()).toEqual(['Marketing']);
  });
});

describe('MultiSelect: blocked states', () => {
  it('disabled: no remove buttons, no opening, out of the tab order', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Centers" state="disabled">
        <MultiSelect options={CENTERS} defaultValue={['mkt']} />
      </Field>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    await user.click(chip('Marketing'));
    await user.tab();
    expect(input()).not.toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it.each(['forced', 'locked'] as const)(
    '%s: focusable; typing, arrows, Enter, clicks and Backspace never open nor change; no remove buttons; chips readable',
    async (fieldState) => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <Field label="Centers" state={fieldState} stateReason="Set by the contract.">
          <Controlled onValueChange={onValueChange} initial={['mkt', 'sal']} />
        </Field>,
      );
      await user.tab();
      expect(input()).toHaveFocus();
      await user.keyboard('{ArrowDown}{ArrowUp}{Enter}ab{Backspace}{Backspace}');
      await user.click(input());
      await user.click(chip('Marketing'));
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(onValueChange).not.toHaveBeenCalled();
      expect(chips()).toEqual(['Marketing', 'Sales']);
      expect(input()).toHaveAccessibleDescription('Set by the contract. Marketing, Sales');
    },
  );

  it('a Field that becomes locked with the list open closes it for good and discards the typed text on blur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Host() {
      const [locked, setLocked] = useState(false);
      return (
        <>
          <Field label="Centers" {...((locked ? { state: 'locked', stateReason: 'Locked.' } : {}) as FieldStateProps)}>
            <Controlled onValueChange={onValueChange} />
          </Field>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setLocked(true)}>
            Lock
          </button>
        </>
      );
    }
    render(<Host />);
    await user.type(input(), 'sa');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lock' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{ArrowDown}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.tab();
    expect(input()).toHaveValue('');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a Field locked from outside (no press outside the list) with the list open: Enter and arrows change nothing; unlocking does not bring the list back', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    let setLocked: (locked: boolean) => void = () => undefined;
    function Host() {
      const [locked, set] = useState(false);
      setLocked = set;
      return (
        <Field label="Centers" {...((locked ? { state: 'locked', stateReason: 'Locked.' } : {}) as FieldStateProps)}>
          <Controlled onValueChange={onValueChange} />
        </Field>
      );
    }
    render(<Host />);
    await user.type(input(), 'sa');
    expect(input()).toHaveAttribute('aria-activedescendant');
    // A business rule locks the field (e.g. a server response): nothing dismisses the popover itself.
    act(() => setLocked(true));
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(onValueChange).not.toHaveBeenCalled();
    act(() => setLocked(false));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input()).toHaveFocus();
  });
});

describe('MultiSelect: announcements', () => {
  it('the status region is mounted empty; it announces the count after a user change, nothing for an external change', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Host() {
      const [value, setValue] = useState<readonly string[]>([]);
      return (
        <>
          <MultiSelect
            aria-label="x"
            options={CENTERS}
            value={value}
            onValueChange={(next) => {
              setValue(next);
              onValueChange(next);
            }}
          />
          <button type="button" onClick={() => setValue(['adm', 'mkt', 'sal'])}>
            Load
          </button>
        </>
      );
    }
    render(<Host />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^$/u);
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(status).toHaveTextContent(/^$/u);
    await user.click(input());
    await user.click(optionNamed('Research'));
    expect(status).toHaveTextContent('4 items selected');
    await user.keyboard('{Backspace}');
    expect(status).toHaveTextContent('3 items selected');
    // Typing replaces the count (no stale announcement when results come back).
    await user.keyboard('zzz');
    expect(status).toHaveTextContent('No results');
    await user.keyboard('{Backspace}{Backspace}{Backspace}');
    expect(status).toHaveTextContent(/^$/u);
    expect(screen.getByRole('status')).toBe(status);
  });

  it('with no options the region stays empty while the list is closed; "No results" only once it opens', async () => {
    const user = userEvent.setup();
    render(<MultiSelect aria-label="x" options={[]} defaultValue={['mkt']} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^$/u);
    await user.click(input());
    expect(status).toHaveTextContent('No results');
    await user.keyboard('{Escape}');
    expect(status).toHaveTextContent(/^$/u);
  });

  it('labels.selectedCount and emptyLabel are used', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelect
        aria-label="x"
        options={CENTERS}
        labels={{ selectedCount: (n) => `${n} chosen`, emptyLabel: 'Nothing' }}
      />,
    );
    await user.click(input());
    await user.click(optionNamed('Sales'));
    expect(screen.getByRole('status')).toHaveTextContent('1 chosen');
    await user.keyboard('qqq');
    expect(screen.getByRole('status')).toHaveTextContent('Nothing');
    expect(within(screen.getByRole('listbox')).getByRole('option')).toHaveTextContent('Nothing');
  });
});

describe('MultiSelect: native form', () => {
  it('with a name: one hidden input per value in selection order; the text input has no name', async () => {
    const user = userEvent.setup();
    render(
      <form data-testid="form">
        <MultiSelect aria-label="x" name="centers" options={CENTERS} defaultValue={['sal']} />
      </form>,
    );
    await user.click(input());
    await user.click(optionNamed('Administration'));
    const form = screen.getByTestId('form') as HTMLFormElement;
    expect(new FormData(form).getAll('centers')).toEqual(['sal', 'adm']);
    expect(input()).not.toHaveAttribute('name');
  });

  it('the Field name is the fallback name of the hidden inputs', () => {
    render(
      <form data-testid="form">
        <Field label="Centers" name="centers">
          <MultiSelect options={CENTERS} defaultValue={['mkt']} />
        </Field>
      </form>,
    );
    expect(new FormData(screen.getByTestId('form') as HTMLFormElement).getAll('centers')).toEqual(['mkt']);
  });

  it('disabled (own prop or Field state): the values are not submitted, like any disabled control', () => {
    render(
      <>
        <form data-testid="own">
          <MultiSelect aria-label="x" name="c" disabled options={CENTERS} defaultValue={['mkt', 'sal']} />
        </form>
        <form data-testid="field">
          <Field label="Centers" name="c" state="disabled">
            <MultiSelect options={CENTERS} defaultValue={['mkt']} />
          </Field>
        </form>
      </>,
    );
    expect(new FormData(screen.getByTestId('own') as HTMLFormElement).getAll('c')).toEqual([]);
    expect(new FormData(screen.getByTestId('field') as HTMLFormElement).getAll('c')).toEqual([]);
    expect(document.querySelectorAll('input[type="hidden"][name="c"]')).toHaveLength(3);
  });

  it('uncontrolled form.reset() goes back to defaultValue with no callback and drops the typed text', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onValueChange = vi.fn();
      render(
        <form data-testid="form">
          <MultiSelect aria-label="x" name="c" options={CENTERS} defaultValue={['mkt']} onValueChange={onValueChange} />
        </form>,
      );
      await user.click(input());
      await user.click(optionNamed('Sales'));
      await user.keyboard('ab');
      onValueChange.mockClear();
      const form = screen.getByTestId('form') as HTMLFormElement;
      act(() => form.reset());
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(chips()).toEqual(['Marketing']);
      expect(input()).toHaveValue('');
      expect(new FormData(form).getAll('c')).toEqual(['mkt']);
      expect(onValueChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('controlled form.reset(): the value stays the consumer\'s, no callback', async () => {
    const onValueChange = vi.fn();
    render(
      <form data-testid="form">
        <MultiSelect aria-label="x" name="c" options={CENTERS} value={['mkt', 'sal']} onValueChange={onValueChange} />
      </form>,
    );
    const form = screen.getByTestId('form') as HTMLFormElement;
    act(() => form.reset());
    await waitFor(() => expect(new FormData(form).getAll('c')).toEqual(['mkt', 'sal']));
    expect(chips()).toEqual(['Marketing', 'Sales']);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
