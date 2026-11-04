import {
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { FieldContext } from '../field/FieldContext';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { CONTROL_INVALID } from '../internal/field-control-styles';
import { Icon } from '../icon/Icon';
import { CapIconSlot } from '../internal/CapIconSlot';
import { internalIcons } from '../internal/icons';
import {
  LISTBOX_CONTENT,
  LISTBOX_EMPTY,
  LISTBOX_ITEM,
  LISTBOX_ITEM_INDICATOR,
  LISTBOX_VIEWPORT,
} from '../internal/listbox-styles';
import { textOf } from '../internal/react-nodes';
import { overlayLayer } from '../overlay/layers';
import { cn } from '../utils/cn';

export type SelectSize = 'sm' | 'md';

export interface SelectOption {
  /** Non-empty (the empty string is Radix's "no value" and is not accepted). Unique in the list. */
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Text used by typeahead. Default: the plain text of `label`. */
  textValue?: string;
}

export interface SelectProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'value' | 'defaultValue' | 'onChange' | 'children' | 'role' | 'type' | 'dir' | 'name' | 'form'
  > {
  options: readonly SelectOption[];
  /**
   * Controlled value. `undefined` (the key being present) means "nothing selected" and shows the
   * placeholder: the consumer never handles a sentinel value. Omit the prop to leave it uncontrolled.
   */
  value?: string | undefined;
  defaultValue?: string;
  /**
   * Called with the chosen option's value, **only** when the user picks an option (click, Enter,
   * Space, typeahead on the trigger). Never called when `value` changes from outside, whatever the
   * new value is (an option that has just arrived, one that does not exist, `undefined`).
   */
  onValueChange?: (value: string) => void;
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Shown in the trigger when `value` matches no option. Default: the raw value. */
  unknownValueLabel?: ReactNode;
  /** Shown in the open list when `options` is empty. Default `No options`. */
  emptyLabel?: ReactNode;
  /** Height scale. Default `md`. */
  size?: SelectSize;
}

// Full literals (Tailwind scan). Same box as Input (32px / 36px); the text is clipped by the value
// span, whose container (the trigger) has a real `max-w-full` and `min-w-0`, so a long label never
// widens the Field.
const TRIGGER =
  'flex max-w-full min-w-0 items-center justify-between gap-2 rounded-rop-md border border-rop-border bg-rop-surface px-3 ' +
  'font-rop-sans text-rop-body text-rop-text text-start focus-visible:[outline:2px_solid_var(--color-rop-primary)] ' +
  'focus-visible:outline-offset-2 data-[placeholder]:text-rop-text-muted disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-readonly:bg-rop-surface-subtle';
const SIZE_CLASS: Record<SelectSize, string> = {
  sm: 'py-[5px]',
  md: 'py-[7px]',
};
const VALUE = 'block min-w-0 flex-1 truncate';

const DUPLICATES_WARNING =
  '[react-object-page] <Select> options must have unique values; the first of each duplicate wins.';

// Keys Radix's trigger reacts to while closed: the opening keys and the typeahead characters.
function opensOrSearches(event: KeyboardEvent<HTMLElement>): boolean {
  if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') return true;
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Single-choice select (wraps `@radix-ui/react-select`): a combobox trigger and a listbox in a
 * portal, on the `popover` level (above a Dialog or Sheet). Inside a `Field` it takes `id`,
 * `aria-labelledby`, `aria-describedby`, `aria-invalid`, `aria-required` and the state from it:
 * `disabled` is out of the tab order; `forced`/`locked` keep the focus and the value but never
 * open (click, Enter, Space, arrows and typeahead included) and do not even reach Radix.
 *
 * `onValueChange` is reached only through an explicit user-gesture gate: a pointer or key event
 * on the trigger or in the list arms it for the duration of that event, and a change that
 * arrives with the gate closed is dropped. Radix is always controlled by this component, so a new
 * `value` from outside is just a render, and the other ways Radix can report a value on its own
 * (a native `form.reset()` back to the value it mounted with, its hidden native `<select>`) never
 * get through. A listbox with a form around it still renders that hidden `<select>`; `name` and
 * `form` are not props of this component.
 */
export const Select = /* @__PURE__ */ forwardRef<HTMLButtonElement, SelectProps>(function Select(props, ref) {
  const {
    options,
    value: valueProp,
    defaultValue,
    onValueChange,
    placeholder,
    unknownValueLabel,
    emptyLabel = 'No options',
    size = 'md',
    className,
    ...rest
  } = props;
  const control = useContext(FieldContext);
  const controlled = 'value' in props;
  const [inner, setInner] = useState<string | undefined>(defaultValue);
  const current = controlled ? valueProp : inner;
  const blocked = control?.interactionBlocked ?? false;
  const [open, setOpen] = useState(false);
  // The list never survives a block: Radix does not report a controlled `open` going false, and
  // the stale `true` would reopen it, with the focus jumping in, when the Field is unblocked.
  if (blocked && open) setOpen(false);
  const gesture = useRef(false);
  // Disarmed by a timer, not a microtask: in a browser a microtask checkpoint runs between React's
  // capture and bubble listeners (two separate native listeners), i.e. before the option's handler.
  const arm = () => {
    gesture.current = true;
    setTimeout(() => {
      gesture.current = false;
    }, 0);
  };
  const gestureProps = {
    onPointerDownCapture: arm,
    onPointerUpCapture: arm,
    onKeyDownCapture: arm,
    onClickCapture: arm,
  };
  const content = useRef<HTMLDivElement>(null);
  const duplicatesWarned = useRef(false);
  if (!duplicatesWarned.current && new Set(options.map((o) => o.value)).size !== options.length) {
    duplicatesWarned.current = true;
    console.warn(DUPLICATES_WARNING);
  }
  // Options that change under an open list: if the active option went away Radix leaves the
  // focus on the list container; put it on the first enabled option.
  // Deferred: Radix's focus scope moves the focus to the container after the removed option
  // unmounts (a mutation observer), later than this effect.
  useEffect(() => {
    const timer = setTimeout(() => {
      const list = content.current;
      if (!list) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.getAttribute('role') === 'option' && list.contains(active)) return;
      if (!list.contains(active) && active !== list) return;
      list.querySelector<HTMLElement>('[role="option"]:not([data-disabled])')?.focus();
    }, 0);
    return () => clearTimeout(timer);
    // Deliberately only on `options`: opening is Radix's to focus (the selected option).
  }, [options]);

  const byValue = useMemo(() => {
    const map = new Map<string, SelectOption>();
    for (const option of options) if (!map.has(option.value)) map.set(option.value, option);
    return map;
  }, [options]);

  const selected = current === undefined || current === '' ? undefined : byValue.get(current);
  const fieldProps = useFieldControlProps(rest);
  // `forced`/`locked`: the list never opens, whatever asks (the trigger keeps the focus).
  const shown = blocked ? false : open;

  // The single path to the consumer: only while a user gesture is being handled (see `arm`), and
  // only for an enabled option. Anything else Radix reports (form reset, native select) is dropped.
  const handleValueChange = (next: string) => {
    if (blocked || !gesture.current) return;
    const option = byValue.get(next);
    if (!option || option.disabled) return;
    if (!controlled) setInner(next);
    onValueChange?.(next);
  };

  return (
    <RadixSelect.Root
      value={current ?? ''}
      onValueChange={handleValueChange}
      open={shown}
      onOpenChange={(next) => {
        if (!blocked) setOpen(next);
      }}
      disabled={fieldProps.disabled}
    >
      <RadixSelect.Trigger
        {...rest}
        ref={ref}
        id={fieldProps.id}
        aria-describedby={fieldProps['aria-describedby']}
        aria-labelledby={fieldProps['aria-labelledby']}
        aria-invalid={fieldProps['aria-invalid']}
        aria-required={fieldProps['aria-required']}
        aria-readonly={fieldProps['aria-readonly']}
        data-rop-name={fieldProps['data-rop-name']}
        // Radix hides everything outside the open list with `aria-hidden`, trigger included; a
        // focusable control under `aria-hidden` is an axe violation. The focus is in the list while
        // open and comes back to the trigger on close (a programmatic focus ignores tabindex).
        tabIndex={shown ? -1 : rest.tabIndex}
        className={cn(TRIGGER, CONTROL_INVALID, SIZE_CLASS[size], className)}
        {...gestureProps}
        // Blocked (forced/locked): the events never reach Radix's trigger, which would otherwise
        // run its typeahead (and fire a native `change` from its hidden select) on a refused value.
        onKeyDown={(event) => {
          rest.onKeyDown?.(event);
          if (blocked && opensOrSearches(event)) event.preventDefault();
        }}
        onPointerDown={(event) => {
          rest.onPointerDown?.(event);
          if (blocked) event.preventDefault();
        }}
        onClick={(event) => {
          rest.onClick?.(event);
          if (blocked) event.preventDefault();
        }}
      >
        {/* Radix's Value drops `className`: the clipping box is this wrapper. */}
        <span className={VALUE}>
          <RadixSelect.Value placeholder={placeholder}>
            {selected ? selected.label : (unknownValueLabel ?? current)}
          </RadixSelect.Value>
        </span>
        <RadixSelect.Icon asChild>
          <Icon size="sm">{internalIcons['chevron-down']}</Icon>
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          ref={content}
          {...gestureProps}
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(LISTBOX_CONTENT, overlayLayer.popover)}
        >
          <RadixSelect.Viewport className={LISTBOX_VIEWPORT}>
            {options.length === 0 ? <div className={LISTBOX_EMPTY}>{emptyLabel}</div> : null}
            {options.map((option) =>
              byValue.get(option.value) === option ? (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  textValue={option.textValue ?? textOf(option.label)}
                  // Radix sets this only on the highlighted option; a listbox shows the selection.
                  aria-selected={option.value === current}
                  className={cn(LISTBOX_ITEM, '[overflow-wrap:anywhere]')}
                >
                  <RadixSelect.ItemIndicator className={LISTBOX_ITEM_INDICATOR}>
                    <CapIconSlot>
                      <Icon size="sm">{internalIcons.check}</Icon>
                    </CapIconSlot>
                  </RadixSelect.ItemIndicator>
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ) : null,
            )}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
});
