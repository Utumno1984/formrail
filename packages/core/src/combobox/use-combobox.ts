import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { escapeKey } from '../internal/escape-key';
import { composeRefs } from '../utils/compose-refs';
import { defaultComboboxFilter } from './filter';

export interface UseComboboxOptions<T> {
  /** Every item; the hook filters them with the input text (`filteredItems`). */
  items: readonly T[];
  /** Plain text of an item: what the input shows once it is selected and what the default filter matches. */
  itemToString: (item: T) => string;
  /** Unique, stable key of an item: option ids and "is this the selected one" derive from it. */
  itemToKey: (item: T) => string;
  /** Controlled selection (`null` = nothing selected). `undefined` leaves the hook uncontrolled. */
  selectedItem?: T | null;
  /** Initial selection when uncontrolled, and the one `reset()` goes back to. Default `null`. */
  defaultSelectedItem?: T | null;
  /** Called only for a selection made by the user, once per gesture, never for the same item. */
  onSelectedItemChange?: (item: T | null) => void;
  /**
   * Controlled input text. The filter uses it as is. The hook never rewrites it on its own: when
   * `selectedItem` changes from outside, the consumer sets the text too (a system change is not a
   * user gesture, so `onInputValueChange` is not called for it).
   */
  inputValue?: string;
  /** Called only when the user changes the text (typing, picking an option, revert after typing). */
  onInputValueChange?: (value: string) => void;
  /** Replaces the default filter. Receives the items and the current input text. */
  filter?: (items: readonly T[], inputValue: string) => readonly T[];
  /** A disabled item is shown but never made active by the arrow keys and never selected by a click. */
  isItemDisabled?: (item: T) => boolean;
  /** Emptying the text and leaving the field clears the selection. Default: the selection stays. */
  clearOnEmpty?: boolean;
}

type InputDomProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'role'> & {
  ref?: Ref<HTMLInputElement>;
};
type ElementDomProps<E extends HTMLElement> = HTMLAttributes<E> & { ref?: Ref<E> };

export interface UseComboboxReturn<T> {
  /** Props for the `<input>`. Consumer handlers run first and can `preventDefault()` ours. */
  getInputProps: (props?: InputDomProps) => InputHTMLAttributes<HTMLInputElement> & {
    ref: (node: HTMLInputElement | null) => void | (() => void);
  };
  /** Props for the listbox element: `role`, `id` (the input's `aria-controls`), and a mousedown that keeps the focus on the input. */
  getListboxProps: <E extends HTMLElement = HTMLElement>(props?: ElementDomProps<E>) => ElementDomProps<E>;
  /** `index` (position in `filteredItems`) is not used for tracking: options are tracked by key. */
  getOptionProps: <E extends HTMLElement = HTMLElement>(
    item: T,
    index: number,
    props?: ElementDomProps<E>,
  ) => ElementDomProps<E>;
  /** Whether the list is open. Keep the listbox mounted (e.g. `hidden`) while it is closed. */
  isOpen: boolean;
  /** Index in `filteredItems` of the active option; `-1` when closed or none. */
  activeIndex: number;
  /** The items to render as options: `items` filtered by the input text (all of them while the input shows the selection). */
  filteredItems: readonly T[];
  /** The effective selection (`null` = none). */
  selectedItem: T | null;
  /** The text of the input: what the user is typing, else the text of the selection. */
  inputValue: string;
  /** Opens the list (e.g. from a toggle button). */
  open: () => void;
  /** Closes the list and clears the active option; the text and the selection are left as they are. */
  close: () => void;
  /**
   * Closes the list, drops what the user typed and restores the text of the selection; with an
   * uncontrolled selection it also goes back to `defaultSelectedItem`. Programmatic, like a change
   * from outside: it never calls `onSelectedItemChange`.
   */
  reset: () => void;
}

// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

/**
 * Headless synchronous combobox (ARIA "combobox with listbox"): focus stays on the input, the
 * active option is exposed with `aria-activedescendant`. No markup, no style.
 *
 * - The text shows `itemToString(selectedItem)` unless the user is typing. A `selectedItem` that
 *   changes from outside never calls `onSelectedItemChange` and never overwrites typed text.
 * - A selection outside the filtered results stays selected; leaving the field reverts the text.
 * - While showing the selection (not typing) the list is unfiltered.
 * - Keep the listbox mounted (e.g. `hidden`) while closed so `aria-controls` points at a node.
 * - A listbox may own only options: with no `filteredItems`, render the "no results" message as an
 *   option with `aria-disabled="true"`. It is not in `filteredItems`, so it is never made active.
 *   The focus stays on the input, so that option is not read on its own: announce the state with a
 *   live region (`role="status"`) mounted from the start, whose text is set only while the open list
 *   is empty. The hook knows nothing of loading: a consumer that fetches `items` must keep that text
 *   empty while a request is in flight and ignore superseded responses, or it announces a stale
 *   "no results".
 */
export function useCombobox<T>(options: UseComboboxOptions<T>): UseComboboxReturn<T> {
  const {
    items,
    itemToString,
    itemToKey,
    defaultSelectedItem,
    onSelectedItemChange,
    onInputValueChange,
    filter,
    isItemDisabled,
    clearOnEmpty = false,
  } = options;

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (item: T) => `${baseId}-option-${escapeKey(itemToKey(item))}`;

  const [isOpen, setIsOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // What the user typed; `null` = not typing, the text derives from the selection.
  const [typedText, setTypedText] = useState<string | null>(null);
  const [internalSelected, setInternalSelected] = useState<T | null>(defaultSelectedItem ?? null);
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const duplicatesWarned = useRef(false);
  // The composed input ref keeps its identity while the consumer's ref does: React would otherwise
  // detach and re-attach it (consumer callback called with `null`, then the node) on every render.
  const composedInputRef = useRef<{ user: Ref<HTMLInputElement> | undefined; composed: ReturnType<typeof composeRefs<HTMLInputElement>> } | null>(null);

  const selectedControlled = options.selectedItem !== undefined;
  const selectedItem = selectedControlled ? (options.selectedItem ?? null) : internalSelected;
  const selectedKey = selectedItem === null ? null : itemToKey(selectedItem);
  const selectedText = selectedItem === null ? '' : itemToString(selectedItem);
  const inputValue = options.inputValue ?? typedText ?? selectedText;

  const showingSelection = typedText === null && selectedItem !== null && inputValue === selectedText;
  const applyFilter = (text: string): readonly T[] =>
    filter ? filter(items, text) : defaultComboboxFilter(items, text, itemToString);
  const filteredItems = useMemo(
    () => (showingSelection ? items : applyFilter(inputValue)),
    // `applyFilter` closes over exactly the deps listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showingSelection, items, inputValue, filter, itemToString],
  );

  const disabled = (item: T) => isItemDisabled?.(item) ?? false;
  const firstEnabled = (list: readonly T[]) => list.findIndex((item) => !disabled(item));
  const lastEnabled = (list: readonly T[]) => {
    for (let i = list.length - 1; i >= 0; i -= 1) if (!disabled(list[i]!)) return i;
    return -1;
  };

  const rawIndex = activeKey === null ? -1 : filteredItems.findIndex((item) => itemToKey(item) === activeKey);
  const activeIndex = isOpen ? rawIndex : -1;

  useEffect(() => {
    if (!isDev() || duplicatesWarned.current) return;
    const keys = items.map(itemToKey);
    if (new Set(keys).size !== keys.length) {
      duplicatesWarned.current = true;
      console.warn('[formrail] useCombobox: `itemToKey` returned duplicate keys; option ids must be unique.');
    }
  }, [items, itemToKey]);

  const setActive = (list: readonly T[], index: number) =>
    setActiveKey(index >= 0 && index < list.length ? itemToKey(list[index]!) : null);

  const open = () => setIsOpen(true);
  const close = () => {
    setIsOpen(false);
    setActiveKey(null);
  };

  /** Puts `text` in the input as a settled value (the user is not typing any more). */
  const commitText = (text: string) => {
    setTypedText(null);
    if (text !== inputValue) onInputValueChange?.(text);
  };

  const selectItem = (item: T) => {
    if (disabled(item)) return;
    if (selectedKey !== itemToKey(item)) {
      if (!selectedControlled) setInternalSelected(item);
      onSelectedItemChange?.(item);
    }
    commitText(itemToString(item));
    close();
  };

  /** Leaving the field: the text goes back to the selection (or the selection is cleared). */
  const revertText = () => {
    if (clearOnEmpty && typedText !== null && inputValue === '' && selectedItem !== null) {
      if (!selectedControlled) setInternalSelected(null);
      onSelectedItemChange?.(null);
      commitText('');
      return;
    }
    commitText(selectedText);
  };

  const reset = () => {
    const next = selectedControlled ? selectedItem : (defaultSelectedItem ?? null);
    if (!selectedControlled) setInternalSelected(next);
    commitText(next === null ? '' : itemToString(next));
    close();
  };

  const move = (direction: 1 | -1) => {
    const enabled = filteredItems.map((item, i) => (disabled(item) ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    let next: number;
    if (rawIndex < 0) next = direction === 1 ? enabled[0]! : enabled[enabled.length - 1]!;
    else if (direction === 1) next = enabled.find((i) => i > rawIndex) ?? rawIndex;
    else next = enabled.filter((i) => i < rawIndex).pop() ?? rawIndex;
    setActive(filteredItems, next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // IME: keys belong to the composition (Enter commits the candidate, it must not select).
    // keyCode 229 covers browsers that fire the final keydown after `compositionend`.
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const down = event.key === 'ArrowDown';
        if (!isOpen) {
          setIsOpen(true);
          const selectedAt = filteredItems.findIndex((item) => itemToKey(item) === selectedKey);
          const at =
            selectedAt >= 0 && !disabled(filteredItems[selectedAt]!)
              ? selectedAt
              : down
                ? firstEnabled(filteredItems)
                : lastEnabled(filteredItems);
          setActive(filteredItems, at);
        } else {
          move(down ? 1 : -1);
        }
        break;
      }
      case 'Home':
      case 'End':
        if (!isOpen) break;
        event.preventDefault();
        setActive(filteredItems, event.key === 'Home' ? firstEnabled(filteredItems) : lastEnabled(filteredItems));
        break;
      case 'Enter':
        if (!isOpen) break;
        event.preventDefault();
        if (activeIndex >= 0) selectItem(filteredItems[activeIndex]!);
        else if (typedText !== null && inputValue === '') {
          // Emptied text with no option to pick: clears the selection (`clearOnEmpty`) or restores it.
          revertText();
          close();
        }
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          close();
        } else if (typedText !== null) {
          // Escape only restores the text; clearing the selection is reserved to leaving the field.
          event.preventDefault();
          commitText(selectedText);
        }
        break;
      case 'Tab':
        // No preventDefault: the focus moves on; the blur reverts the text.
        close();
        break;
      default:
        break;
    }
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setTypedText(text);
    onInputValueChange?.(text);
    setIsOpen(true);
    const matches = applyFilter(text);
    // Empty text is not a match: no option is active, so Enter cannot replace the selection.
    setActive(matches, text === '' ? -1 : firstEnabled(matches));
  };

  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    // The window lost the focus (alt-tab) but the input is still the active element: the user has
    // not left the field, keep the text and the list.
    if (document.activeElement === event.currentTarget) return;
    composing.current = false;
    close();
    if (typedText !== null) revertText();
  };

  const getInputProps: UseComboboxReturn<T>['getInputProps'] = (props = {}) => {
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
      value: inputValue,
      'aria-expanded': isOpen,
      'aria-controls': listboxId,
      'aria-autocomplete': 'list',
      'aria-activedescendant': isOpen && activeIndex >= 0 ? optionId(filteredItems[activeIndex]!) : undefined,
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        userKeyDown?.(event);
        if (!event.defaultPrevented) onKeyDown(event);
      },
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        userChange?.(event);
        if (!event.defaultPrevented) onChange(event);
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

  // The listbox and its options never take the focus: the mousedown default (focus change, and
  // with it the input's blur) is cancelled so the focus stays on the input.
  const keepFocusOnInput = (event: MouseEvent<Element>) => event.preventDefault();

  function getListboxProps<E extends HTMLElement = HTMLElement>(props: ElementDomProps<E> = {}): ElementDomProps<E> {
    const { onMouseDown, ...rest } = props;
    return {
      ...rest,
      role: 'listbox',
      id: listboxId,
      onMouseDown: (event: MouseEvent<E>) => {
        onMouseDown?.(event);
        if (!event.defaultPrevented) keepFocusOnInput(event);
      },
    };
  }

  function getOptionProps<E extends HTMLElement = HTMLElement>(
    item: T,
    _index: number,
    props: ElementDomProps<E> = {},
  ): ElementDomProps<E> {
    const { onClick, onMouseMove, ...rest } = props;
    const isDisabled = disabled(item);
    const key = itemToKey(item);
    return {
      ...rest,
      role: 'option',
      id: optionId(item),
      'aria-selected': selectedKey !== null && key === selectedKey,
      'aria-disabled': isDisabled,
      onClick: (event: MouseEvent<E>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        selectItem(item);
        if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.focus();
      },
      onMouseMove: (event: MouseEvent<E>) => {
        onMouseMove?.(event);
        // By key, so a consumer that renders the options in groups (relative index) still works.
        if (!event.defaultPrevented && !isDisabled && key !== activeKey) setActiveKey(key);
      },
    };
  }

  return {
    getInputProps,
    getListboxProps,
    getOptionProps,
    isOpen,
    activeIndex,
    filteredItems,
    selectedItem,
    inputValue,
    open,
    close,
    reset,
  };
}
