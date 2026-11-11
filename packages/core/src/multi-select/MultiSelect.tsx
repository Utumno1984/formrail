import {
  forwardRef,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import * as Popover from '@radix-ui/react-popover';
import { FieldContext } from '../field/FieldContext';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { Icon } from '../icon/Icon';
import { COMBOBOX_ANCHOR, COMBOBOX_LIST, COMBOBOX_OPTION } from '../internal/combobox-styles';
import { CapIconSlot } from '../internal/CapIconSlot';
import { internalIcons } from '../internal/icons';
import { isDev } from '../internal/is-dev';
import { useKeyboardOpen } from '../internal/keyboard-open';
import {
  LISTBOX_CONTENT_POPOVER,
  LISTBOX_EMPTY,
  LISTBOX_ITEM,
  LISTBOX_ITEM_INDICATOR,
  LISTBOX_VIEWPORT,
} from '../internal/listbox-styles';
import {
  MULTI_SELECT_BOX,
  MULTI_SELECT_CHIP,
  MULTI_SELECT_CHIP_REMOVE,
  MULTI_SELECT_CHIP_STATIC,
  MULTI_SELECT_INPUT,
  MULTI_SELECT_SIZE,
  MULTI_SELECT_SR_ONLY,
} from '../internal/multi-select-styles';
import { overlayLayer } from '../overlay/layers';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import { useMultiSelect, type MultiSelectOption } from './use-multi-select';

export type { MultiSelectOption } from './use-multi-select';

export type MultiSelectSize = 'sm' | 'md';

/** Texts of the MultiSelect (§1.13.3). */
export interface MultiSelectLabels {
  /** Shown in the open list (and announced) when nothing matches. Default `No results`. */
  emptyLabel: string;
  /** Accessible name of a chip's remove button. Default `Remove ${label}`. */
  removeValue: (label: string) => string;
  /** Announced after the user adds or removes a value. Default `1 item selected` / `${n} items selected`. */
  selectedCount: (count: number) => string;
}

const DEFAULT_LABELS: MultiSelectLabels = {
  emptyLabel: 'No results',
  removeValue: (label) => `Remove ${label}`,
  selectedCount: (count) => (count === 1 ? '1 item selected' : `${count} items selected`),
};

export interface MultiSelectProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'size' | 'role' | 'type' | 'children'
> {
  /** The choices, filtered by the text typed in the input. Each has a unique `value`. */
  options: readonly MultiSelectOption[];
  /**
   * Controlled value, in selection order. `undefined` or `null` (the key being present) mean "nothing
   * selected", like `[]`. Omit the prop to leave it uncontrolled. Duplicates are shown once.
   */
  value?: readonly string[] | undefined;
  /** Initial value of the uncontrolled MultiSelect. Default `[]`. */
  defaultValue?: readonly string[];
  /**
   * Called once per user gesture (a pick or un-pick in the list, Backspace on an empty text, a chip's
   * remove button) with the whole next value, in selection order (a new value goes last). Removing
   * the last value gives `[]`, never `undefined`. Never called when `value` or `options` change from
   * outside.
   */
  onValueChange?: (values: string[]) => void;
  /** Replaces the default filter (case- and diacritics-insensitive substring match on the label). */
  filter?: (options: readonly MultiSelectOption[], inputValue: string) => readonly MultiSelectOption[];
  /** Chip text of a value that matches no option. Default: the raw value. */
  unknownValueLabel?: (value: string) => string;
  /** Height of an empty field (the field grows when the chips wrap). Default `md`. */
  size?: MultiSelectSize;
  labels?: Partial<MultiSelectLabels>;
}

// Keys that would open or change the value: swallowed while the Field blocks interaction. Enter and
// Escape are left alone (implicit form submit, closing a Dialog).
const BLOCKED_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Backspace']);

const COLLISION_PADDING = 8;

const EMPTY: readonly string[] = [];

/** Duplicates dropped (first occurrence wins); `null`/`undefined` read as empty. */
function uniqueValues(values: readonly string[] | null | undefined): readonly string[] {
  if (!values || values.length === 0) return EMPTY;
  const unique = [...new Set(values)];
  return unique.length === values.length ? values : unique;
}

/**
 * Synchronous multi-value combobox: the selected values are chips inside the field, before a text
 * input that filters the list. The list is a Popover in a portal on the `popover` level (above a
 * Dialog or Sheet), anchored to the whole field (it follows the field when the chips wrap), and the
 * focus never leaves the input.
 *
 * - Click or Enter on an option toggles it; the list stays open on the same active option and the
 *   typed text is emptied. Backspace on an empty text removes the last chip; a chip's remove button
 *   (pointer and touch only, out of the tab order) removes that one and keeps the focus on the input.
 * - A selected value that the current filter hides, or that matches a `disabled` option, stays a chip
 *   and can be removed. A value with no option is shown with `unknownValueLabel` (default: the raw value).
 * - Option labels should be unique: the remove buttons are named after them.
 * - Inside a `Field` it takes `id`, `aria-describedby` (merged, followed by the hidden list of the
 *   selected labels), `aria-invalid`, `aria-required` and the state: `disabled` is out of the tab
 *   order; `forced`/`locked` keep the focus and the chips but never open and never change the value.
 * - With a `name` (its own, or the Field's) every value is a hidden input of that name, in selection
 *   order (`FormData.getAll(name)`); the text input has no name. A native form reset puts an
 *   uncontrolled MultiSelect back to `defaultValue` with no `onValueChange`.
 *
 * `className` goes on the field box (the border); the other props and `ref` on the text input.
 * `onValueChange` is called only for a user gesture: a `value` (or `options`) that changes from
 * outside is just a render. A polite live region, mounted from the start, announces `emptyLabel`
 * once each time the open list enters that state, and the selection size after each user change.
 */
export const MultiSelect = /* @__PURE__ */ forwardRef<HTMLInputElement, MultiSelectProps>(function MultiSelect(
  props,
  ref,
) {
  const {
    options,
    value: valueProp,
    defaultValue,
    onValueChange,
    filter,
    unknownValueLabel,
    size = 'md',
    labels: labelsProp,
    className,
    placeholder,
    ...rest
  } = props;
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const control = useContext(FieldContext);
  const fieldProps = useFieldControlProps(rest);
  const { name, ...inputFieldProps } = fieldProps;
  const disabled = !!fieldProps.disabled;
  const blocked = (control?.interactionBlocked ?? false) || disabled || !!fieldProps.readOnly;
  const controlled = 'value' in props;
  const anchorRef = useRef<HTMLDivElement>(null);
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const descriptionId = `${useId()}-selected`;

  const [internal, setInternal] = useState<readonly string[]>(() => uniqueValues(defaultValue));
  const rawValues = controlled ? valueProp : internal;
  const values = uniqueValues(rawValues);

  const duplicatesWarned = useRef(false);
  useEffect(() => {
    if (!isDev() || duplicatesWarned.current) return;
    const problems: string[] = [];
    if (rawValues && values.length !== rawValues.length) problems.push('`value` has duplicates (shown once)');
    if (new Set(options.map((o) => o.value)).size !== options.length) problems.push('two options share a `value`');
    if (new Set(options.map((o) => o.label)).size !== options.length) {
      problems.push('two options share a `label` (their remove buttons would have the same name)');
    }
    if (problems.length === 0) return;
    duplicatesWarned.current = true;
    console.warn(`[formrail] MultiSelect: ${problems.join('; ')}.`);
  }, [rawValues, values, options]);

  const byValue = useMemo(() => {
    const map = new Map<string, MultiSelectOption>();
    for (const option of options) if (!map.has(option.value)) map.set(option.value, option);
    return map;
  }, [options]);
  const labelOf = (value: string) => byValue.get(value)?.label ?? unknownValueLabel?.(value) ?? value;

  const state = useMultiSelect({
    options,
    values,
    filter,
    onChange: (next) => {
      if (!controlled) setInternal(next);
      onValueChange?.(next);
    },
  });

  // The list never survives a block: hidden now, and closed for good so it does not reappear.
  const { close, isOpen, clearText, inputRef } = state;
  useEffect(() => {
    if (blocked && isOpen) close();
  }, [blocked, isOpen, close]);
  const shown = isOpen && !blocked;
  const keyboardOpen = useKeyboardOpen(shown);

  // Native form reset: the event fires before the browser resets the inputs, so the state is put
  // back on the next task, and a re-render re-applies the React-owned values over the reset ones.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const resetTo = useRef<() => void>(() => undefined);
  resetTo.current = () => {
    if (!controlled) setInternal(uniqueValues(defaultValue));
    clearText();
    rerender();
  };
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onReset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => resetTo.current(), 0);
    };
    form.addEventListener('reset', onReset);
    return () => {
      clearTimeout(timer);
      form.removeEventListener('reset', onReset);
    };
  }, [inputRef]);

  const activeOption = shown && state.activeIndex >= 0 ? state.filteredOptions[state.activeIndex] : undefined;
  const activeValue = activeOption?.value;
  const { filteredOptions } = state;
  // Also re-run when the list changes under the same active option: a pick empties the filter, the
  // unfiltered list comes back from the top and the active option may now be far below the fold.
  useEffect(() => {
    const list = listEl;
    if (!list || activeValue === undefined) return;
    const el = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!el) return;
    const l = list.getBoundingClientRect();
    const o = el.getBoundingClientRect();
    if (o.top < l.top) list.scrollTop -= l.top - o.top;
    else if (o.bottom > l.bottom) list.scrollTop += o.bottom - l.bottom;
  }, [activeValue, filteredOptions, listEl]);

  // The native `name` belongs to the hidden inputs, never to the text input.
  const inputProps = state.getInputProps({
    ...rest,
    name: undefined,
    ref,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      rest.onKeyDown?.(event);
      if (blocked && BLOCKED_KEYS.has(event.key)) event.preventDefault();
    },
    onClick: (event: MouseEvent<HTMLInputElement>) => {
      rest.onClick?.(event);
      if (!event.defaultPrevented && !blocked) state.open();
    },
  });

  const focusInput = () => {
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.focus();
  };

  // A press on the box outside the input (a chip, the padding) focuses the input and opens the
  // list; the default (focus change) is cancelled so an already focused input does not blur.
  const onBoxMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target === inputRef.current || disabled) return;
    event.preventDefault();
    focusInput();
    if (!blocked) state.open();
  };

  const listbox = state.getListboxProps<HTMLDivElement>({ ref: setListEl });
  const noResults = shown && state.filteredOptions.length === 0;
  const announcement = noResults
    ? labels.emptyLabel
    : state.announcedCount !== null
      ? labels.selectedCount(state.announcedCount)
      : '';
  const removable = !blocked;
  const describedBy =
    [inputFieldProps['aria-describedby'], values.length > 0 ? descriptionId : undefined].filter(Boolean).join(' ') ||
    undefined;
  const invalid = inputFieldProps['aria-invalid'] !== undefined && String(inputFieldProps['aria-invalid']) !== 'false';

  return (
    <Popover.Root
      open={shown}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Popover.Anchor asChild>
        <div ref={anchorRef} className={COMBOBOX_ANCHOR}>
          {/* Pointer convenience only: the input inside is the keyboard target. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className={cn(MULTI_SELECT_BOX, MULTI_SELECT_SIZE[size], className)}
            data-rop-multi-select=""
            data-disabled={disabled ? '' : undefined}
            // The chips of a disabled field are inactive text (exempt from the contrast minimum, like
            // the disabled input next to them).
            aria-disabled={disabled ? true : undefined}
            data-readonly={fieldProps.readOnly ? '' : undefined}
            data-invalid={invalid ? '' : undefined}
            onMouseDown={onBoxMouseDown}
          >
            {values.map((value) => {
              const label = labelOf(value);
              return (
                <span key={value} className={cn(MULTI_SELECT_CHIP, removable ? undefined : MULTI_SELECT_CHIP_STATIC)}>
                  <TruncatedText>{label}</TruncatedText>
                  {removable ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={labels.removeValue(label)}
                      className={MULTI_SELECT_CHIP_REMOVE}
                      onMouseDown={(event) => {
                        // Keeps the focus where it is; the box handler would open the list.
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={() => {
                        state.remove(value);
                        focusInput();
                      }}
                    >
                      <Icon size="xs">{internalIcons.close}</Icon>
                    </button>
                  ) : null}
                </span>
              );
            })}
            <input
              {...inputProps}
              {...inputFieldProps}
              ref={inputProps.ref}
              aria-describedby={describedBy}
              placeholder={values.length === 0 ? placeholder : undefined}
              className={MULTI_SELECT_INPUT}
            />
          </div>
          {/* Always mounted, outside the portal and out of the flow: the selected labels (read as
              the input's description) and the live region (a region inserted already filled is
              not announced). */}
          <span id={descriptionId} className={MULTI_SELECT_SR_ONLY}>
            {values.map(labelOf).join(', ')}
          </span>
          <div role="status" aria-live="polite" aria-atomic="true" className={MULTI_SELECT_SR_ONLY}>
            {announcement}
          </div>
          {name !== undefined && name !== ''
            ? values.map((value) => <input key={value} type="hidden" name={name} value={value} disabled={disabled} />)
            : null}
        </div>
      </Popover.Anchor>
      {shown ? null : <div {...listbox} ref={undefined} hidden />}
      {shown ? (
        <Popover.Portal>
          <Popover.Content
            role="presentation"
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={COLLISION_PADDING}
            updatePositionStrategy={keyboardOpen ? 'always' : 'optimized'}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            // Radix dismisses on Escape from a capture listener, before the input's handler: an
            // Escape that belongs to an IME composition must not close the list.
            onEscapeKeyDown={(event) => {
              if (event.isComposing || event.keyCode === 229 || state.isComposing()) event.preventDefault();
            }}
            // A press inside the field (input, chip, remove button) is not "outside".
            onInteractOutside={(event) => {
              if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
            }}
            className={cn(LISTBOX_CONTENT_POPOVER, overlayLayer.popover)}
          >
            <div {...listbox} className={cn(LISTBOX_VIEWPORT, COMBOBOX_LIST)}>
              {state.filteredOptions.length === 0 ? (
                <div role="option" aria-disabled="true" aria-selected="false" data-disabled="" className={LISTBOX_EMPTY}>
                  {labels.emptyLabel}
                </div>
              ) : null}
              {state.filteredOptions.map((option, index) => {
                const isSelected = values.includes(option.value);
                return (
                  <div
                    key={option.value}
                    {...state.getOptionProps(option)}
                    data-active={index === state.activeIndex}
                    data-highlighted={index === state.activeIndex ? '' : undefined}
                    data-disabled={option.disabled ? '' : undefined}
                    className={cn(LISTBOX_ITEM, COMBOBOX_OPTION)}
                  >
                    {isSelected ? (
                      <span className={LISTBOX_ITEM_INDICATOR}>
                        <CapIconSlot>
                          <Icon size="sm">{internalIcons.check}</Icon>
                        </CapIconSlot>
                      </span>
                    ) : null}
                    {option.label}
                  </div>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
});
