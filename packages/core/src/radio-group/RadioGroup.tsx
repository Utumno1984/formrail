import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { FieldContext } from '../field/FieldContext';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { isDev } from '../internal/is-dev';
import { hasContent } from '../internal/react-nodes';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';

export type RadioGroupOrientation = 'vertical' | 'horizontal';

export interface RadioGroupProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'defaultValue' | 'onChange' | 'role' | 'aria-invalid' | 'aria-required' | 'aria-readonly'
  > {
  /**
   * Controlled selection: the `value` of the selected item, or `null` for "nothing selected".
   * Omit the prop (leave it `undefined`) to leave the group uncontrolled.
   */
  value?: string | null;
  /** Initial selection when uncontrolled. */
  defaultValue?: string;
  /**
   * Called with the item's value **only** when the user selects it (click on the radio or on its
   * label, arrow keys). Never called when `value` changes from outside, nor on a form reset, nor
   * while the group is `forced`/`locked`/disabled.
   */
  onValueChange?: (value: string) => void;
  /** Layout of the items. Also exposed as `aria-orientation`. Default `vertical`. */
  orientation?: RadioGroupOrientation;
  /** Disables every item. A disabled `Field` does the same. */
  disabled?: boolean;
  /** Shared native `name` of the radios. Default: the Field's `name`, else generated. */
  name?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-required'?: boolean | 'true' | 'false';
  'aria-readonly'?: boolean | 'true' | 'false';
  children?: ReactNode;
}

export interface RadioGroupItemProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'checked' | 'defaultChecked' | 'onChange' | 'children' | 'readOnly' | 'size' | 'name' | 'value'
  > {
  /** The value this item stands for. Must be unique inside the group. */
  value: string;
  /** Inline label, to the right of the radio. */
  children?: ReactNode;
}

interface RadioGroupState {
  name: string;
  value: string | null | undefined;
  defaultValue: string | undefined;
  controlled: boolean;
  blocked: boolean;
  disabled: boolean;
  select: (value: string) => void;
  realign: () => void;
  refresh: () => void;
}

const RadioGroupContext = /* @__PURE__ */ createContext<RadioGroupState | null>(null);

// Full literals (Tailwind scan). The radio is a native input drawn by `appearance-none`; the dot is
// a sibling shown through `peer-checked`, so it follows the real DOM state (controlled or not).
// No preflight: content-box, hence 14px + 2px border = 16px; the cell around it is 24px tall.
const GROUP = 'group/rg flex min-w-0 max-w-full font-rop-sans text-rop-body text-rop-text';
const VERTICAL = 'flex-col gap-1';
const HORIZONTAL = 'flex-row flex-wrap gap-x-4 gap-y-1';
const ROW =
  'inline-flex max-w-full min-w-0 items-start gap-1 ' + 'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';
const CELL = 'relative inline-flex h-6 w-6 shrink-0 items-center justify-center';
const RADIO =
  'peer m-0 block h-3.5 w-3.5 cursor-pointer appearance-none rounded-full border border-rop-text-muted bg-rop-surface ' +
  'checked:border-rop-primary disabled:cursor-not-allowed not-forced-colors:group-aria-invalid/rg:border-rop-error not-forced-colors:group-aria-invalid/rg:checked:border-rop-error ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2 ' +
  'motion-safe:[transition-property:border-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)] ' +
  'forced-colors:border-[ButtonText] forced-colors:checked:border-[Highlight]';
const DOT =
  'pointer-events-none absolute inset-0 m-auto hidden h-2 w-2 rounded-full bg-rop-primary peer-checked:block not-forced-colors:group-aria-invalid/rg:bg-rop-error ' +
  'forced-colors:bg-[Highlight]';
const TEXT = 'min-w-0 py-0.5 [overflow-wrap:anywhere]';
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const NO_NAME_WARNING =
  '[react-object-page] <RadioGroup> has no accessible name: put it in a <Field label>, or pass `aria-label` or `aria-labelledby`.';
const BOTH_WARNING =
  '[react-object-page] <RadioGroup> received both `value` and `defaultValue`: `value` wins and `defaultValue` is ignored.';

/**
 * RadioGroup: native `<input type="radio">` items (`RadioGroupItem`) sharing one `name` inside a
 * `role="radiogroup"` container, so Tab (one stop), arrows (move **and** select, skipping disabled
 * items, RTL-aware) and form participation are the browser's own.
 *
 * Inside a `Field` the **group** (not any radio) carries the Field's `id`, `aria-labelledby`,
 * `aria-describedby`, `aria-invalid`, `aria-required` and `aria-readonly`: a click on the Field's
 * label targets a non-labelable element and changes nothing, in every state. `forced`/`locked`
 * (`interactionBlocked`) keep the selected radio focusable but cancel `click` and the arrow keys
 * (native `readOnly` does not stop radios). `onValueChange` is called only from a user gesture.
 *
 * `required` on the Field is exposed as `aria-required` on the group only: the radios get no native
 * `required`, so the browser's own form validation does not block a submit with nothing selected.
 */
export const RadioGroup = /* @__PURE__ */ forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(props, ref) {
  const {
    value,
    defaultValue,
    onValueChange,
    orientation = 'vertical',
    className,
    children,
    disabled: ownDisabled,
    name: ownName,
    ...rest
  } = props;
  const control = useContext(FieldContext);
  const fieldProps = useFieldControlProps({ ...rest, disabled: ownDisabled, name: ownName });
  const blocked = control?.interactionBlocked ?? false;
  const disabled = fieldProps.disabled ?? false;
  const controlled = value !== undefined;
  const generatedName = useId();
  const name = fieldProps.name ?? generatedName;
  const container = useRef<HTMLDivElement>(null);
  const mergedRef = useMemo(() => composeRefs(ref, container), [ref]);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const warned = useRef(false);
  const hasName = Boolean(fieldProps['aria-labelledby'] ?? rest['aria-label']);

  useEffect(() => {
    if (!isDev() || warned.current) return;
    if (!hasName) {
      warned.current = true;
      console.error(NO_NAME_WARNING);
    } else if (controlled && defaultValue !== undefined) {
      warned.current = true;
      console.error(BOTH_WARNING);
    }
  }, [hasName, controlled, defaultValue]);

  // `useFocusFirstInvalidField` looks a control up by `data-rop-name` and focuses ONE element: the
  // radio where Tab would land (the selected one, else the first enabled). Only that radio carries
  // the attribute, set on the DOM after every render because the selection of an uncontrolled
  // group lives in the DOM. React never renders this attribute on the radios, so it never clears it.
  // It is refreshed whenever the group re-renders (user gesture, reset, Field context change such as
  // a new error, parent re-render). Items added later by a child component with its own state do not
  // re-render the group: keep the options in the component that renders the group.
  const fieldName = fieldProps['data-rop-name'];
  useEffect(() => {
    const radios = Array.from(container.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? []);
    const enabled = radios.filter((el) => !el.disabled);
    const target = enabled.find((el) => el.checked) ?? enabled[0];
    for (const el of radios) {
      if (fieldName && el === target) el.setAttribute('data-rop-name', fieldName);
      else el.removeAttribute('data-rop-name');
    }
  });

  // React's value tracker is only updated through the `checked` setter. A cancelled click (or a
  // form reset) makes the browser change `checked` behind its back, so the next real click would
  // look like "no change" and onChange would never fire. Re-assigning the same values realigns it.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((fn: () => void) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, 0);
    timers.current.add(timer);
  }, []);
  const realign = useCallback(() => {
    later(() => {
      container.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((el) => {
        const checked = el.checked;
        el.checked = checked;
      });
    });
  }, [later]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  useEffect(() => {
    const form = container.current?.closest('form');
    if (!form) return;
    const onReset = () => {
      realign();
      // A controlled group must be put back to `value` by React once the browser has reset.
      later(refresh);
    };
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, [realign, later]);

  const state: RadioGroupState = {
    name,
    value,
    defaultValue,
    controlled,
    blocked,
    disabled,
    select: (next) => onValueChange?.(next),
    realign,
    refresh,
  };

  return (
    <RadioGroupContext.Provider value={state}>
      <div
        {...rest}
        ref={mergedRef}
        role="radiogroup"
        id={fieldProps.id}
        aria-labelledby={fieldProps['aria-labelledby']}
        aria-describedby={fieldProps['aria-describedby']}
        aria-invalid={fieldProps['aria-invalid']}
        aria-required={fieldProps['aria-required']}
        aria-readonly={fieldProps['aria-readonly']}
        aria-orientation={orientation}
        className={cn(GROUP, orientation === 'horizontal' ? HORIZONTAL : VERTICAL, className)}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
});

/** One radio of a `RadioGroup`: a native `<input type="radio">` with its inline `<label>`. */
export const RadioGroupItem = /* @__PURE__ */ forwardRef<HTMLInputElement, RadioGroupItemProps>(function RadioGroupItem(
  props,
  ref,
) {
  const { value, children, className, disabled, onClick, onKeyDown, id, ...rest } = props;
  const group = useContext(RadioGroupContext);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const unnamed = !hasContent(children) && !rest['aria-label'] && !rest['aria-labelledby'];
  useEffect(() => {
    if (unnamed && isDev()) {
      console.error(`[react-object-page] <RadioGroupItem value="${value}"> has no accessible name: give it children, \`aria-label\` or \`aria-labelledby\`.`);
    }
  }, [unnamed, value]);

  if (!group) {
    if (isDev()) console.error('[react-object-page] <RadioGroupItem> must be rendered inside a <RadioGroup>.');
    return null;
  }
  const { blocked } = group;

  const handleClick = (event: MouseEvent<HTMLInputElement>) => {
    onClick?.(event);
    if (blocked) event.preventDefault();
    if (event.nativeEvent.defaultPrevented) group.refresh();
    // A cancelled click leaves React's tracker out of step with the DOM: always realign.
    if (!group.controlled) group.realign();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    // Arrows move AND select a native radio: when blocked they must do neither.
    if (blocked && ARROWS.has(event.key)) event.preventDefault();
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!blocked && !event.nativeEvent.defaultPrevented) group.select(value);
    group.refresh();
  };

  const selection = group.controlled
    ? { checked: group.value === value }
    : { defaultChecked: group.defaultValue === value };

  return (
    <label className={ROW} htmlFor={inputId}>
      <span className={CELL}>
        <input
          {...rest}
          {...selection}
          type="radio"
          ref={ref}
          id={inputId}
          name={group.name}
          value={value}
          disabled={group.disabled || disabled}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onChange={handleChange}
          className={cn(RADIO, className)}
        />
        <span aria-hidden="true" className={DOT} />
      </span>
      {hasContent(children) ? <span className={TEXT}>{children}</span> : null}
    </label>
  );
});
