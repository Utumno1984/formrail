import {
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { resolveLocale } from '../calendar/locale';
import { FieldContext } from '../field/FieldContext';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { Icon } from '../icon/Icon';
import { CONTROL_INVALID } from '../internal/field-control-styles';
import { stepperIcons } from '../internal/icons';
import { isDev } from '../internal/is-dev';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import {
  canonicalString,
  clamp,
  createNumberLocale,
  normalizeLimit,
  normalizeStep,
  normalizeValue,
  stepFrom,
} from './number-parse';

export type NumberInputSize = 'sm' | 'md';

/** Accessible names of the stepper buttons (spec §1.13.3). */
export interface NumberInputLabels {
  /** Default `Increase`. */
  increment: string;
  /** Default `Decrease`. */
  decrement: string;
}

const DEFAULT_LABELS: NumberInputLabels = { increment: 'Increase', decrement: 'Decrease' };

export interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'size' | 'role' | 'type' | 'min' | 'max' | 'step' | 'inputMode' | 'children'
> {
  /**
   * Controlled value. `undefined` (the key being present) is the empty field; `null`, `NaN` and
   * `±Infinity` are shown as empty too (the last two with a development warning). A value outside
   * `[min, max]` is shown as it is: only a user gesture clamps it. Omit the prop to leave it
   * uncontrolled.
   */
  value?: number | undefined;
  /** Initial value of the uncontrolled NumberInput, and the value a native form reset restores. */
  defaultValue?: number;
  /**
   * Called only for a user gesture, and only when the value really changes: on focus loss and on Enter
   * for typed text (never per keystroke), at once for ArrowUp/ArrowDown, PageUp/PageDown, Home/End
   * and the stepper buttons. Emptying the text and leaving the field gives `undefined`. Text that is
   * not a number restores the last valid value without a call. Never called when `value` or
   * `locale` change from outside.
   */
  onValueChange?: (value: number | undefined) => void;
  /** Lower limit. When `min > max`, `min` wins (development warning). */
  min?: number;
  /** Upper limit. */
  max?: number;
  /**
   * Amount of an arrow key or stepper press (PageUp/PageDown: × 10). Default `1`; a value ≤ 0 or
   * not finite falls back to `1` (development warning). Typed values are never rounded to it.
   */
  step?: number;
  /**
   * BCP 47 tag of the text's format (decimal separator, digits). Default: the runtime's. An invalid
   * tag falls back to the runtime default. Typing accepts the locale's decimal separator and `.`;
   * thousands separators are never shown nor accepted.
   */
  locale?: string;
  /** Accessible names of the stepper buttons. */
  labels?: Partial<NumberInputLabels>;
  /** Height scale. Default `md`. */
  size?: NumberInputSize;
}

// Same box as Input (32px / 36px), with the end padding reserving the two 24px stepper buttons.
const INPUT =
  'block max-w-full min-w-0 rounded-rop-md border border-rop-border bg-rop-surface ps-3 pe-[3.75rem] font-rop-sans text-rop-body text-rop-text ' +
  'placeholder:text-rop-text-muted focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2 ' +
  'read-only:bg-rop-readonly-surface read-only:not-disabled:border-dashed disabled:cursor-not-allowed disabled:opacity-50';
const SIZE_CLASS: Record<NumberInputSize, string> = {
  sm: 'py-[5px]',
  md: 'py-[7px]',
};
// A stretched flex item like the Input; the steppers sit inside the input's border, at the end.
const ROOT = 'relative flex min-w-0 max-w-full flex-col';
const STEPPERS = 'absolute inset-y-px end-px flex';
const STEPPER =
  'm-0 inline-flex w-6 cursor-pointer items-center justify-center rounded-rop-sm border-0 bg-transparent p-0 text-rop-text-muted ' +
  'not-disabled:rop-hover:text-rop-text disabled:pointer-events-none disabled:opacity-50';

const warn = (message: string) => {
  if (isDev()) console.warn(`[react-object-page] <NumberInput> ${message}`);
};

/**
 * Numeric field: a text input with `role="spinbutton"`, a `number | undefined` value, `min`/`max`/
 * `step`, the arrow keys and two stepper buttons. Inside a `Field` it takes `id`,
 * `aria-describedby`, `aria-invalid`, `aria-required`, `aria-readonly`, `disabled`, `readOnly` and
 * `data-rop-name` from it, like `Input`.
 *
 * - Typing is a draft: the value is read on focus loss and on Enter, limited to `[min, max]`, and not
 *   rounded to `step`. A `value` changed from outside while the user is typing does not replace the
 *   draft; without a draft the text follows it at once.
 * - ArrowUp/ArrowDown ± `step`, PageUp/PageDown ± `step × 10`, Home/End → `min`/`max` (only when
 *   defined). From an empty field the first step sets `min`, or `0` without a `min` (then limited by
 *   `max`). Steps start from the current value (or the valid draft) and carry no floating-point
 *   noise. During an IME composition Enter and the arrows do nothing.
 * - The stepper buttons are out of the tab order, keep the focus where it is and are disabled at
 *   their limit. They do not repeat while held.
 * - The mouse wheel never changes the value.
 * - `forced`/`locked` (or `readOnly`): focusable, and no channel (typing, paste, keys, steppers)
 *   changes the value; a draft pending when the Field becomes blocked is dropped on focus loss.
 * - With a `name` (own or the Field's), a hidden native input carries the canonical value (`"1.5"`,
 *   `""` when empty) for `FormData`; the visible input has no `name`. A native form reset restores
 *   `defaultValue` without calling `onValueChange`.
 */
export const NumberInput = /* @__PURE__ */ forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(props, ref) {
  const {
    value: valueProp,
    defaultValue,
    onValueChange,
    min: minProp,
    max: maxProp,
    step: stepProp,
    locale,
    labels: labelsProp,
    size = 'md',
    className,
    onKeyDown,
    onBlur,
    onCompositionStart,
    onCompositionEnd,
    ...rest
  } = props;
  const control = useContext(FieldContext);
  const fieldProps = useFieldControlProps(rest);
  const blocked = (control?.interactionBlocked ?? false) || !!fieldProps.readOnly || !!fieldProps.disabled;

  const controlled = 'value' in props;
  const [inner, setInner] = useState<number | undefined>(() => normalizeValue(defaultValue));
  const value = controlled ? normalizeValue(valueProp) : inner;
  // What the user typed; `null` = not typing, the text derives from the value.
  const [draft, setDraft] = useState<string | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const composedRef = useMemo(() => composeRefs(inputRef, ref), [ref]);

  const resolvedLocale = resolveLocale(locale);
  const numberLocale = useMemo(() => createNumberLocale(resolvedLocale), [resolvedLocale]);
  const min = normalizeLimit(minProp);
  const max = normalizeLimit(maxProp);
  const step = normalizeStep(stepProp);
  const labels = { ...DEFAULT_LABELS, ...labelsProp };

  const formatted = value === undefined ? '' : numberLocale.format(value);
  const text = draft ?? formatted;

  useEffect(() => {
    if (min !== undefined && max !== undefined && min > max) warn(`min (${min}) is greater than max (${max}): min wins.`);
  }, [min, max]);
  useEffect(() => {
    if (stepProp !== undefined && normalizeStep(stepProp) !== stepProp) warn(`step ${String(stepProp)} is not a finite number > 0: 1 is used.`);
  }, [stepProp]);
  useEffect(() => {
    if (controlled && typeof valueProp === 'number' && !Number.isFinite(valueProp)) {
      warn(`value ${String(valueProp)} is not a finite number: shown as empty.`);
    }
  }, [controlled, valueProp]);

  const latest = useRef({ controlled, defaultValue });
  latest.current = { controlled, defaultValue };
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // `reset` fires before the browser resets the controls: act on the next task.
    const onReset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!latest.current.controlled) setInner(normalizeValue(latest.current.defaultValue));
        setDraft(null);
        rerender();
      }, 0);
    };
    form.addEventListener('reset', onReset);
    return () => {
      form.removeEventListener('reset', onReset);
      clearTimeout(timer);
    };
  }, [rest.form]);

  const emit = (next: number | undefined) => {
    if (Object.is(next, value)) return;
    if (!controlled) setInner(next);
    onValueChange?.(next);
  };

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (blocked) return;
    const parsed = numberLocale.parse(draft);
    if (parsed.kind === 'empty') emit(undefined);
    else if (parsed.kind === 'number') emit(clamp(parsed.value, min, max));
  };

  /** The value a step starts from: the valid draft, else the current value. */
  const base = (): number | undefined => {
    if (draft === null) return value;
    const parsed = numberLocale.parse(draft);
    if (parsed.kind === 'number') return parsed.value;
    return parsed.kind === 'empty' ? undefined : value;
  };

  const stepBy = (direction: 1 | -1, multiplier: number) => {
    if (blocked) return;
    const from = base();
    setDraft(null);
    emit(from === undefined ? clamp(min ?? 0, min, max) : stepFrom(from, step, direction, multiplier, min, max));
  };

  const setTo = (target: number) => {
    if (blocked) return;
    setDraft(null);
    emit(clamp(target, min, max));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    switch (event.key) {
      case 'Enter':
        commit();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault();
        stepBy(event.key === 'ArrowUp' ? 1 : -1, 1);
        break;
      case 'PageUp':
      case 'PageDown':
        event.preventDefault();
        stepBy(event.key === 'PageUp' ? 1 : -1, 10);
        break;
      case 'Home':
        if (min === undefined) break;
        event.preventDefault();
        setTo(min);
        break;
      case 'End':
        if (max === undefined) break;
        event.preventDefault();
        setTo(max);
        break;
    }
  };

  const atMax = value !== undefined && max !== undefined && value >= max;
  const atMin = value !== undefined && min !== undefined && value <= min;
  const integerKeypad = Number.isInteger(step) && min !== undefined && min >= 0;
  const name = fieldProps.name;

  return (
    <div className={ROOT}>
      <input
        {...rest}
        {...fieldProps}
        name={undefined}
        ref={composedRef}
        type="text"
        role="spinbutton"
        inputMode={integerKeypad ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={text}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={value === undefined ? undefined : formatted}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          if (!blocked) setDraft(event.currentTarget.value);
        }}
        onBlur={(event: FocusEvent<HTMLInputElement>) => {
          onBlur?.(event);
          commit();
        }}
        onKeyDown={handleKeyDown}
        onCompositionStart={(event) => {
          composing.current = true;
          onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          onCompositionEnd?.(event);
        }}
        className={cn(INPUT, CONTROL_INVALID, SIZE_CLASS[size], className)}
      />
      {/* No focus on press, so the focus stays where it is (on the input while typing). A disabled
          button lets the press through (`pointer-events: none`) to this group, which also blocks it. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className={STEPPERS} onMouseDown={(event) => event.preventDefault()}>
        {(
          [
            [-1, labels.decrement, atMin, stepperIcons.minus],
            [1, labels.increment, atMax, stepperIcons.plus],
          ] as const
        ).map(([direction, label, atLimit, icon]) => (
          <button
            key={direction}
            type="button"
            tabIndex={-1}
            aria-label={label}
            aria-controls={fieldProps.id}
            disabled={blocked || atLimit}
            onClick={() => stepBy(direction, 1)}
            className={STEPPER}
          >
            <Icon size="sm">{icon}</Icon>
          </button>
        ))}
      </div>
      {name === undefined ? null : (
        <input type="hidden" name={name} value={canonicalString(value)} disabled={fieldProps.disabled} form={rest.form} />
      )}
    </div>
  );
});
