import { useId, useMemo, useRef, useState } from 'react';
import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  Ref,
} from 'react';
import { defaultComboboxFilter } from '../combobox/filter';
import { escapeKey } from '../internal/escape-key';
import { composeRefs } from '../utils/compose-refs';

export interface MultiSelectOption {
  /** Unique in the list. */
  value: string;
  /** Plain text: it is what the chip and the list show and what the filter matches. */
  label: string;
  /**
   * Shown but not selectable: the arrow keys skip it and a click does nothing (`aria-disabled`). A
   * value already selected that matches it stays a chip.
   */
  disabled?: boolean;
}

export interface UseMultiSelectOptions {
  options: readonly MultiSelectOption[];
  /** The current selection (already resolved by the caller: controlled or not, without duplicates). */
  values: readonly string[];
  /** Called once per user gesture with the whole next selection. Never for a change from outside. */
  onChange: (values: string[]) => void;
  filter?: (options: readonly MultiSelectOption[], inputValue: string) => readonly MultiSelectOption[];
}

type InputDomProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'role'> & {
  ref?: Ref<HTMLInputElement>;
};
type ElementDomProps<E extends HTMLElement> = HTMLAttributes<E> & { ref?: Ref<E> };

export interface UseMultiSelectReturn {
  getInputProps: (props?: InputDomProps) => InputHTMLAttributes<HTMLInputElement> & {
    ref: (node: HTMLInputElement | null) => void | (() => void);
  };
  getListboxProps: <E extends HTMLElement = HTMLElement>(props?: ElementDomProps<E>) => ElementDomProps<E>;
  getOptionProps: <E extends HTMLElement = HTMLElement>(option: MultiSelectOption) => ElementDomProps<E>;
  isOpen: boolean;
  /** Index in `filteredOptions` of the active option; `-1` when closed or none. */
  activeIndex: number;
  filteredOptions: readonly MultiSelectOption[];
  inputValue: string;
  /** Selection size after the last user change, until the text changes or the list closes; else `null`. */
  announcedCount: number | null;
  open: () => void;
  close: () => void;
  /** Removes `value` as a user gesture (a chip's remove button). */
  remove: (value: string) => void;
  /** Drops the typed text without any callback (form reset). */
  clearText: () => void;
  /** True between `compositionstart` and `compositionend` (or the blur). */
  isComposing: () => boolean;
  inputRef: { readonly current: HTMLInputElement | null };
}

/**
 * Internal headless state of `MultiSelect`, an ARIA "combobox with listbox" whose value is a list.
 * Same rules as `useCombobox` (focus always on the input, active option by key through
 * `aria-activedescendant`, listbox kept mounted while closed, "no results" as a disabled option
 * outside `filteredOptions`, keys ignored during an IME composition), with the multi-value
 * differences: the text is always free and is emptied after a pick, a pick toggles the option and
 * leaves the list open on the same active option, Backspace on an empty text removes the last value.
 */
export function useMultiSelect({ options, values, onChange, filter }: UseMultiSelectOptions): UseMultiSelectReturn {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (option: MultiSelectOption) => `${baseId}-option-${escapeKey(option.value)}`;

  const [isOpen, setIsOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [announcedCount, setAnnouncedCount] = useState<number | null>(null);
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const composedInputRef = useRef<{
    user: Ref<HTMLInputElement> | undefined;
    composed: ReturnType<typeof composeRefs<HTMLInputElement>>;
  } | null>(null);

  const applyFilter = (value: string): readonly MultiSelectOption[] =>
    filter ? filter(options, value) : defaultComboboxFilter(options, value, (option) => option.label);
  const filteredOptions = useMemo(
    () => applyFilter(text),
    // `applyFilter` closes over exactly the deps listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, text, filter],
  );
  const selected = new Set(values);

  const firstEnabled = (list: readonly MultiSelectOption[]) => list.findIndex((option) => !option.disabled);
  const lastEnabled = (list: readonly MultiSelectOption[]) => {
    for (let i = list.length - 1; i >= 0; i -= 1) if (!list[i]!.disabled) return i;
    return -1;
  };
  const rawIndex = activeKey === null ? -1 : filteredOptions.findIndex((option) => option.value === activeKey);
  const activeIndex = isOpen ? rawIndex : -1;

  const setActive = (list: readonly MultiSelectOption[], index: number) =>
    setActiveKey(index >= 0 && index < list.length ? list[index]!.value : null);

  const open = () => setIsOpen(true);
  const close = () => {
    setIsOpen(false);
    setActiveKey(null);
    setAnnouncedCount(null);
  };

  const commit = (next: string[]) => {
    onChange(next);
    setAnnouncedCount(next.length);
  };

  const toggle = (option: MultiSelectOption) => {
    if (option.disabled) return;
    commit(selected.has(option.value) ? values.filter((v) => v !== option.value) : [...values, option.value]);
    setText('');
    // The active option stays the same: the unfiltered list still has it.
    setActiveKey(option.value);
  };

  const remove = (value: string) => {
    if (!selected.has(value)) return;
    commit(values.filter((v) => v !== value));
  };

  const move = (direction: 1 | -1) => {
    const enabled = filteredOptions.map((option, i) => (option.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    let next: number;
    if (rawIndex < 0) next = direction === 1 ? enabled[0]! : enabled[enabled.length - 1]!;
    else if (direction === 1) next = enabled.find((i) => i > rawIndex) ?? rawIndex;
    else next = enabled.filter((i) => i < rawIndex).pop() ?? rawIndex;
    setActive(filteredOptions, next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // IME: keys belong to the composition. keyCode 229 covers the final keydown some browsers fire
    // after `compositionend`.
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const down = event.key === 'ArrowDown';
        if (!isOpen) {
          setIsOpen(true);
          setActive(filteredOptions, down ? firstEnabled(filteredOptions) : lastEnabled(filteredOptions));
        } else {
          move(down ? 1 : -1);
        }
        break;
      }
      case 'Home':
      case 'End':
        if (!isOpen) break;
        event.preventDefault();
        setActive(filteredOptions, event.key === 'Home' ? firstEnabled(filteredOptions) : lastEnabled(filteredOptions));
        break;
      case 'Enter':
        if (!isOpen) break;
        event.preventDefault();
        if (activeIndex >= 0) toggle(filteredOptions[activeIndex]!);
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          close();
        } else if (text !== '') {
          event.preventDefault();
          setText('');
        }
        break;
      case 'Backspace':
        if (text === '' && values.length > 0) {
          event.preventDefault();
          commit(values.slice(0, -1));
        }
        break;
      case 'Tab':
        // No preventDefault: the focus moves on; the blur drops the text.
        close();
        break;
      default:
        break;
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setText(next);
    setAnnouncedCount(null);
    setIsOpen(true);
    const matches = applyFilter(next);
    setActive(matches, next === '' ? -1 : firstEnabled(matches));
  };

  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    // The window lost the focus but the input is still the active element: the user has not left.
    if (document.activeElement === event.currentTarget) return;
    composing.current = false;
    close();
    setText('');
  };

  const getInputProps: UseMultiSelectReturn['getInputProps'] = (props = {}) => {
    const {
      ref,
      onKeyDown: userKeyDown,
      onChange: userChange,
      onBlur: userBlur,
      onCompositionStart,
      onCompositionEnd,
      ...rest
    } = props;
    let cached = composedInputRef.current;
    if (cached === null || cached.user !== ref) {
      cached = { user: ref, composed: composeRefs(ref, inputRef) };
      composedInputRef.current = cached;
    }
    return {
      autoComplete: 'off',
      ...rest,
      ref: cached.composed,
      role: 'combobox',
      value: text,
      'aria-expanded': isOpen,
      'aria-controls': listboxId,
      'aria-autocomplete': 'list',
      'aria-activedescendant': isOpen && activeIndex >= 0 ? optionId(filteredOptions[activeIndex]!) : undefined,
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        userKeyDown?.(event);
        if (!event.defaultPrevented) onKeyDown(event);
      },
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        userChange?.(event);
        if (!event.defaultPrevented) onInputChange(event);
      },
      onBlur: (event: FocusEvent<HTMLInputElement>) => {
        userBlur?.(event);
        if (!event.defaultPrevented) onBlur(event);
      },
      onCompositionStart: (event: CompositionEvent<HTMLInputElement>) => {
        composing.current = true;
        onCompositionStart?.(event);
      },
      onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
        composing.current = false;
        onCompositionEnd?.(event);
      },
    };
  };

  // The listbox and its options never take the focus (the input would blur and close the list).
  const keepFocusOnInput = (event: MouseEvent<Element>) => event.preventDefault();

  function getListboxProps<E extends HTMLElement = HTMLElement>(props: ElementDomProps<E> = {}): ElementDomProps<E> {
    const { onMouseDown, ...rest } = props;
    return {
      ...rest,
      role: 'listbox',
      id: listboxId,
      'aria-multiselectable': true,
      onMouseDown: (event: MouseEvent<E>) => {
        onMouseDown?.(event);
        if (!event.defaultPrevented) keepFocusOnInput(event);
      },
    };
  }

  function getOptionProps<E extends HTMLElement = HTMLElement>(option: MultiSelectOption): ElementDomProps<E> {
    return {
      role: 'option',
      id: optionId(option),
      'aria-selected': selected.has(option.value),
      'aria-disabled': !!option.disabled,
      onClick: () => {
        toggle(option);
        if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.focus();
      },
      onMouseMove: () => {
        if (!option.disabled && option.value !== activeKey) setActiveKey(option.value);
      },
    };
  }

  return {
    getInputProps,
    getListboxProps,
    getOptionProps,
    isOpen,
    activeIndex,
    filteredOptions,
    inputValue: text,
    announcedCount,
    open,
    close,
    remove,
    clearText: () => setText(''),
    isComposing: () => composing.current,
    inputRef,
  };
}
