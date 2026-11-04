import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ChangeEvent,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { FieldContext } from '../field/FieldContext';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { CONTROL_INVALID } from '../internal/field-control-styles';
import { isDev } from '../internal/is-dev';
import { hasContent } from '../internal/react-nodes';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';

/** The state of a controlled Checkbox. */
export type CheckedState = boolean | 'indeterminate';

export interface CheckboxProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'checked' | 'defaultChecked' | 'onChange' | 'children' | 'readOnly' | 'size'
  > {
  /**
   * Controlled state. `'indeterminate'` shows a dash and sets the DOM `indeterminate` property
   * (exposed as "mixed"); a click moves it to `true`. Omit the prop to leave the Checkbox uncontrolled.
   */
  checked?: CheckedState;
  /** Initial state when uncontrolled. */
  defaultChecked?: boolean;
  /**
   * Called with the new state **only** when the user toggles the box (click on the box or on a
   * label, Space). Never called when `checked` changes from outside, nor on a form reset.
   */
  onCheckedChange?: (checked: boolean) => void;
  /** Inline label, to the right of the box. */
  children?: ReactNode;
}

// Full literals (Tailwind scan). The box is drawn on a native input (`appearance-none`); the check
// and the dash are sibling SVGs shown through `peer-*` variants, so they follow the real DOM state
// whether the Checkbox is controlled or not. No preflight: boxes are content-box, hence 14px + 2px
// border = 16px. The cell around the box is 24px tall (the minimum target size).
const ROW =
  'inline-flex max-w-full min-w-0 items-start gap-1 font-rop-sans text-rop-body text-rop-text ' +
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';
const CELL = 'relative inline-flex h-6 w-6 shrink-0 items-center justify-center';
const BOX =
  'peer m-0 block h-3.5 w-3.5 cursor-pointer appearance-none rounded-rop-sm border border-rop-text-muted bg-rop-surface ' +
  'checked:bg-rop-primary indeterminate:bg-rop-primary disabled:cursor-not-allowed ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2 ' +
  'motion-safe:[transition-property:background-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)] ' +
  'forced-colors:border-[ButtonText] forced-colors:checked:bg-[Highlight] forced-colors:indeterminate:bg-[Highlight]';
const MARK =
  'pointer-events-none absolute inset-0 m-auto hidden h-3 w-3 text-rop-primary-contrast forced-colors:text-[HighlightText]';
const TEXT = 'min-w-0 py-0.5 [overflow-wrap:anywhere]';

const BOTH_WARNING =
  '[react-object-page] <Checkbox> received both `checked` and `defaultChecked`: `checked` wins and `defaultChecked` is ignored.';

/**
 * Checkbox: a styled native `<input type="checkbox">` with an optional inline label. Inside a
 * `Field` it takes `id`, `name`, `aria-describedby` (merged with its own), `aria-invalid`,
 * `aria-required`, `aria-readonly`, `disabled` and `data-rop-name` from it; the accessible name is
 * the Field's label followed by the inline label.
 *
 * Native `readOnly` does not stop a checkbox, so `forced`/`locked` (`interactionBlocked`) cancel the
 * `click` event instead: that covers the box, the Field's label, the inline label and Space. The
 * control stays focusable and keeps its value. `onCheckedChange` is called only from the user's
 * toggle, never when `checked` changes from outside or on a form reset.
 */
export const Checkbox = /* @__PURE__ */ forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(props, ref) {
  const { checked, defaultChecked, onCheckedChange, children, className, onClick, ...rest } = props;
  const control = useContext(FieldContext);
  const fieldProps = useFieldControlProps(rest);
  const blocked = control?.interactionBlocked ?? false;
  const controlled = checked !== undefined;
  const inlineId = useId();
  const generatedId = useId();
  const id = fieldProps.id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const mergedRef = useMemo(() => composeRefs(ref, input), [ref]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const warned = useRef(false);

  useEffect(() => {
    if (controlled && defaultChecked !== undefined && !warned.current && isDev()) {
      warned.current = true;
      console.error(BOTH_WARNING);
    }
  }, [controlled, defaultChecked]);

  // The browser clears `indeterminate` on a click and React never writes it: apply it after every
  // render (a click also forces one, see `handleChange`), so a consumer that keeps 'indeterminate' wins.
  const hadMixed = useRef(false);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    if (controlled) {
      el.indeterminate = checked === 'indeterminate';
      hadMixed.current = el.indeterminate;
    } else if (hadMixed.current) {
      // Controlled 'indeterminate' -> uncontrolled: React never clears the property.
      el.indeterminate = false;
      hadMixed.current = false;
    }
  });

  // React's value tracker is only updated through the `checked` setter. A cancelled click (or a
  // form reset) makes the browser change `checked` behind its back, so the next real click would
  // look like "no change" and onChange would never fire. Re-assigning the same value realigns it.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const realign = useCallback(() => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      const el = input.current;
      if (el) {
        const value = el.checked;
        el.checked = value;
      }
    }, 0);
    timers.current.add(timer);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  useEffect(() => {
    const form = input.current?.form;
    if (!form || controlled) return;
    form.addEventListener('reset', realign);
    return () => form.removeEventListener('reset', realign);
  }, [controlled, realign]);

  const hasInline = hasContent(children);
  const labelledBy = [fieldProps['aria-labelledby'], hasInline ? inlineId : undefined].filter(Boolean).join(' ');

  const handleClick = (event: MouseEvent<HTMLInputElement>) => {
    onClick?.(event);
    if (blocked) event.preventDefault();
    if (event.nativeEvent.defaultPrevented) rerender();
    // An ancestor's onClick (or a native listener) can still cancel the click after this handler
    // ran, so always realign after an uncontrolled click: re-assigning the same value is harmless.
    if (!controlled) realign();
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!blocked && !event.nativeEvent.defaultPrevented) onCheckedChange?.(event.currentTarget.checked);
    rerender();
  };

  const stateProps = controlled ? { checked: checked === true } : { defaultChecked };

  return (
    <label className={ROW} htmlFor={id}>
      <span className={CELL}>
        <input
          {...rest}
          {...stateProps}
          type="checkbox"
          ref={mergedRef}
          id={id}
          name={fieldProps.name}
          disabled={fieldProps.disabled}
          aria-describedby={fieldProps['aria-describedby']}
          aria-labelledby={labelledBy || undefined}
          aria-invalid={fieldProps['aria-invalid']}
          aria-required={fieldProps['aria-required']}
          aria-readonly={fieldProps['aria-readonly']}
          data-rop-name={fieldProps['data-rop-name']}
          onClick={handleClick}
          onChange={handleChange}
          className={cn(BOX, CONTROL_INVALID, className)}
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          className={cn(MARK, 'peer-[:checked:not(:indeterminate)]:block')}
        >
          <path d="M5 12.5l5 5L19 7" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
          className={cn(MARK, 'peer-indeterminate:block')}
        >
          <path d="M6 12h12" />
        </svg>
      </span>
      {hasInline ? (
        <span id={inlineId} className={TEXT}>
          {children}
        </span>
      ) : null}
    </label>
  );
});
