import {
  forwardRef,
  useContext,
  useEffect,
  useMemo,
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
import { CONTROL_INVALID } from '../internal/field-control-styles';
import {
  COMBOBOX_ANCHOR,
  COMBOBOX_INPUT,
  COMBOBOX_LIST,
  COMBOBOX_OPTION,
  COMBOBOX_SIZE,
  COMBOBOX_STATUS,
} from '../internal/combobox-styles';
import { CapIconSlot } from '../internal/CapIconSlot';
import { internalIcons } from '../internal/icons';
import {
  LISTBOX_CONTENT_POPOVER,
  LISTBOX_EMPTY,
  LISTBOX_ITEM,
  LISTBOX_ITEM_INDICATOR,
  LISTBOX_VIEWPORT,
} from '../internal/listbox-styles';
import { overlayLayer } from '../overlay/layers';
import { cn } from '../utils/cn';
import { useCombobox } from './use-combobox';

export type ComboboxSize = 'sm' | 'md';

export interface ComboboxOption {
  /** Unique in the list. */
  value: string;
  /** Plain text: it is what the input shows and what the filter matches. */
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'size' | 'role' | 'type' | 'children'
> {
  options: readonly ComboboxOption[];
  /**
   * Controlled value. `undefined` (the key being present) means "nothing selected" and shows the
   * placeholder: the consumer never handles a sentinel value. Omit the prop to leave it uncontrolled.
   */
  value?: string | undefined;
  defaultValue?: string;
  /**
   * Called only when the user picks an option (click, Enter) or, with `clearOnEmpty`, empties the
   * text and leaves the field (`undefined`). Never called when `value` changes from outside,
   * whatever the new value is (an option that has just arrived, one that does not exist, `undefined`).
   */
  onValueChange?: (value: string | undefined) => void;
  /** Shown in the open list when nothing matches. Default `No results`. */
  emptyLabel?: string;
  /** Shown in the input when `value` matches no option. Default: the raw value. */
  unknownValueLabel?: string;
  /** Replaces the default filter (case- and diacritics-insensitive substring match on the label). */
  filter?: (options: readonly ComboboxOption[], inputValue: string) => readonly ComboboxOption[];
  /** Emptying the text and leaving the field clears the selection. Default: the selection stays. */
  clearOnEmpty?: boolean;
  /** Height scale. Default `md`. */
  size?: ComboboxSize;
}

// Keys that would open the list (the others only act on an open one): swallowed while the Field
// blocks interaction. Enter and Escape are left alone (implicit form submit, closing a Dialog).
const LIST_KEYS = new Set(['ArrowDown', 'ArrowUp']);

const COLLISION_PADDING = 8;

/**
 * True while the on-screen keyboard covers part of the layout viewport (spec §1.10). The
 * positioning engine already measures the room on the visual viewport, but only re-measures on
 * window resize and scroll, which the keyboard does not fire: the caller switches the popover to
 * per-frame updates while this is true, so the list follows the keyboard coming, growing and going.
 */
function useKeyboardOpen(active: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!active || !vv) return undefined;
    // Pinch-zoom also resizes the visual viewport: the arithmetic is for scale 1 only.
    const update = () => setOpen(vv.scale === 1 && window.innerHeight - vv.height - vv.offsetTop > 1);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setOpen(false);
    };
  }, [active]);
  return open;
}

/**
 * Synchronous combobox (input + filtered list), built on `useCombobox`: the list is a Popover in a
 * portal on the `popover` level (above a Dialog or Sheet), anchored to the input, and the focus
 * never leaves the input. Inside a `Field` it takes `id`, `aria-describedby`, `aria-invalid`,
 * `aria-required` and the state from it: `disabled` is out of the tab order; `forced`/`locked`
 * keep the focus and the value but never open (typing, arrows, Enter and click included).
 *
 * `onValueChange` is called only for a user gesture: a `value` that changes from outside, to an
 * option that has just arrived, an unknown value or `undefined`, is just a render.
 *
 * When the open list has nothing to show, `emptyLabel` is both the list's disabled option and the
 * text of a visually hidden `role="status"` region next to the input, announced once each time the
 * list enters that state and emptied when results come back or the list closes. A second query that
 * also matches nothing leaves the text as it is, so it is not announced again (the state has not
 * changed). The Combobox has no loading state: `options={[]}` while the parent is loading shows and
 * announces `emptyLabel`, exactly like the list does.
 */
export const Combobox = /* @__PURE__ */ forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(props, ref) {
  const {
    options,
    value: valueProp,
    defaultValue,
    onValueChange,
    emptyLabel = 'No results',
    unknownValueLabel,
    filter,
    clearOnEmpty,
    size = 'md',
    className,
    ...rest
  } = props;
  const control = useContext(FieldContext);
  const blocked = control?.interactionBlocked ?? false;
  const controlled = 'value' in props;
  const anchorRef = useRef<HTMLDivElement>(null);
  // State, not a ref: the portal content mounts one render after the list opens, and the scroll
  // effect must run again once the node exists.
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);

  const byValue = useMemo(() => {
    const map = new Map<string, ComboboxOption>();
    for (const option of options) if (!map.has(option.value)) map.set(option.value, option);
    return map;
  }, [options]);

  // A value with no option still has to be seen: it becomes a selected item outside `options`.
  const toItem = (value: string | undefined): ComboboxOption | null => {
    if (value === undefined || value === '') return null;
    return byValue.get(value) ?? { value, label: unknownValueLabel ?? value };
  };

  const combobox = useCombobox<ComboboxOption>({
    items: options,
    itemToString: (option) => option.label,
    itemToKey: (option) => option.value,
    isItemDisabled: (option) => !!option.disabled,
    selectedItem: controlled ? toItem(valueProp) : undefined,
    defaultSelectedItem: toItem(defaultValue),
    onSelectedItemChange: (item) => onValueChange?.(item?.value),
    filter,
    clearOnEmpty,
  });

  // The list never survives a block: hidden now, and closed for good so it does not reappear,
  // with a stale active option, when the Field is unblocked.
  const { close, isOpen } = combobox;
  useEffect(() => {
    if (blocked && isOpen) close();
  }, [blocked, isOpen, close]);
  const shown = isOpen && !blocked;
  const keyboardOpen = useKeyboardOpen(shown);

  // Keep the active option in view inside the list (the focus stays on the input, so the browser
  // does not scroll it by itself). Measured against the list, never `scrollIntoView`, which would
  // also scroll the page.
  const activeOption = shown && combobox.activeIndex >= 0 ? combobox.filteredItems[combobox.activeIndex] : undefined;
  const activeValue = activeOption?.value;
  useEffect(() => {
    const list = listEl;
    if (!list || activeValue === undefined) return;
    const el = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!el) return;
    const l = list.getBoundingClientRect();
    const o = el.getBoundingClientRect();
    if (o.top < l.top) list.scrollTop -= l.top - o.top;
    else if (o.bottom > l.bottom) list.scrollTop += o.bottom - l.bottom;
  }, [activeValue, listEl]);

  const fieldProps = useFieldControlProps(rest);
  const inputProps = combobox.getInputProps({
    ...rest,
    ref,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      rest.onKeyDown?.(event);
      // Blocked (forced/locked): the keys that would open or drive the list never reach the hook.
      if (blocked && LIST_KEYS.has(event.key)) event.preventDefault();
    },
    onClick: (event: MouseEvent<HTMLInputElement>) => {
      rest.onClick?.(event);
      if (!event.defaultPrevented && !blocked) combobox.open();
    },
  });

  const listbox = combobox.getListboxProps<HTMLDivElement>({ ref: setListEl });
  // While typing the focus stays on the input, so the disabled message option is never read on its
  // own: the state is announced by a live region instead. Its text depends only on "the open list
  // shows the message", so keystrokes that keep that state leave the DOM text untouched (React skips
  // an identical text) and nothing is re-announced; each entry into the state is a new announcement.
  const noResults = shown && combobox.filteredItems.length === 0;

  return (
    <Popover.Root
      open={shown}
      onOpenChange={(next) => {
        if (!next) combobox.close();
      }}
    >
      <Popover.Anchor asChild>
        <div ref={anchorRef} className={COMBOBOX_ANCHOR}>
          <input
            {...inputProps}
            {...fieldProps}
            ref={inputProps.ref}
            className={cn(COMBOBOX_INPUT, CONTROL_INVALID, COMBOBOX_SIZE[size], className)}
          />
          {/* Always mounted and outside the portal: a live region inserted already filled is not
              announced. Out of the flex flow (absolute), so the anchor keeps the input's box. */}
          <div role="status" aria-live="polite" aria-atomic="true" className={COMBOBOX_STATUS}>
            {noResults ? emptyLabel : ''}
          </div>
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
            // The room is measured on the visual viewport (already without the keyboard); while the
            // keyboard is up the measure runs every frame, since nothing else tells the engine.
            updatePositionStrategy={keyboardOpen ? 'always' : 'optimized'}
            // The focus stays on the input: the popover neither takes it on open nor returns it.
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            // Escape is Radix's here (dismiss -> `close`): while the list is the top layer a Dialog
            // underneath ignores it, so the first Escape closes only the list.
            // A click on the input is not "outside"; a click elsewhere blurs the input, which closes.
            onInteractOutside={(event) => {
              if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
            }}
            className={cn(LISTBOX_CONTENT_POPOVER, overlayLayer.popover)}
          >
            <div {...listbox} className={cn(LISTBOX_VIEWPORT, COMBOBOX_LIST)}>
              {combobox.filteredItems.length === 0 ? (
                // A listbox may own only options: the message is one, disabled and outside
                // `filteredItems`, so the arrows, `aria-activedescendant` and Enter never reach it.
                <div role="option" aria-disabled="true" aria-selected="false" data-disabled="" className={LISTBOX_EMPTY}>
                  {emptyLabel}
                </div>
              ) : null}
              {combobox.filteredItems.map((option, index) => {
                const selected = combobox.selectedItem?.value === option.value;
                return (
                  <div
                    key={option.value}
                    {...combobox.getOptionProps(option, index)}
                    data-active={index === combobox.activeIndex}
                    data-highlighted={index === combobox.activeIndex ? '' : undefined}
                    data-disabled={option.disabled ? '' : undefined}
                    className={cn(LISTBOX_ITEM, COMBOBOX_OPTION)}
                  >
                    {selected ? (
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
