import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
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
import { CapIconSlot } from '../internal/CapIconSlot';
import { CONTROL_INVALID } from '../internal/field-control-styles';
import { isDev } from '../internal/is-dev';
import { hasContent } from '../internal/react-nodes';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';

export interface SwitchProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'role' | 'checked' | 'defaultChecked' | 'onChange' | 'children' | 'readOnly' | 'size'
  > {
  /** Controlled state. Omit the prop to leave the Switch uncontrolled. */
  checked?: boolean;
  /** Initial state when uncontrolled. */
  defaultChecked?: boolean;
  /**
   * Called with the new state **only** when the user toggles the switch (click on the track, on a
   * label, Space). Never called when `checked` changes from outside, nor on a form reset. Enter does
   * not toggle (native behaviour of a checkbox).
   */
  onCheckedChange?: (checked: boolean) => void;
  /** Inline label, to the right of the switch (to the left in RTL). */
  children?: ReactNode;
}

// Full literals (Tailwind scan). The track is a native input (`appearance-none`). There is no
// preflight, so boxes are content-box: 36x20 + 2px border = the real 40x24 target. The thumb is a
// sibling shown through `peer-checked:` so it follows the real DOM state whether the Switch is controlled or not. The state is readable without colour:
// the thumb sits at the start when off and at the end when on (mirrored in RTL).
const ROW =
  'inline-flex max-w-full min-w-0 items-start gap-2 font-rop-sans text-rop-body text-rop-text ' +
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';
// The cell is one 20px text line plus the label's 2px padding (24px, as tall as the track): the track
// is centred on the cap height of the label's first line (`CapIconSlot`), whatever the font.
const CELL = 'w-10 py-0.5';
const TRACK =
  'peer m-0 box-content block h-5 w-9 cursor-pointer appearance-none rounded-full border-2 border-rop-text-muted bg-rop-surface ' +
  'checked:border-rop-primary checked:bg-rop-primary disabled:cursor-not-allowed ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2 ' +
  'motion-safe:[transition-property:background-color,border-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)] ' +
  'forced-colors:border-[ButtonText] forced-colors:checked:border-[Highlight] forced-colors:checked:bg-[Highlight]';
const THUMB =
  'pointer-events-none absolute start-1 top-1 h-4 w-4 rounded-full bg-rop-text-muted ' +
  'peer-checked:start-5 peer-checked:bg-rop-primary-contrast ' +
  'motion-safe:[transition-property:inset-inline-start,background-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)] ' +
  'forced-colors:bg-[ButtonText] forced-colors:peer-checked:bg-[HighlightText]';
const TEXT = 'min-w-0 py-0.5 [overflow-wrap:anywhere]';

const BOTH_WARNING =
  '[react-object-page] <Switch> received both `checked` and `defaultChecked`: `checked` wins and `defaultChecked` is ignored.';

/**
 * Switch: a styled native `<input type="checkbox" role="switch">` with an optional inline label.
 * Inside a `Field` it takes `id`, `name`, `aria-describedby` (merged with its own), `aria-invalid`,
 * `aria-required`, `aria-readonly`, `disabled` and `data-rop-name` from it; the accessible name is
 * the Field's label followed by the inline label.
 *
 * Native `readOnly` does not stop a checkbox, so `forced`/`locked` (`interactionBlocked`) cancel the
 * `click` event instead: that covers the track, the Field's label, the inline label and Space. The
 * control stays focusable and keeps its value. `onCheckedChange` is called only from the user's
 * toggle, never when `checked` changes from outside or on a form reset.
 */
export const Switch = /* @__PURE__ */ forwardRef<HTMLInputElement, SwitchProps>(function Switch(props, ref) {
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

  const stateProps = controlled ? { checked } : { defaultChecked };

  return (
    <label className={ROW} htmlFor={id}>
      <CapIconSlot className={CELL}>
        <input
          {...rest}
          {...stateProps}
          type="checkbox"
          role="switch"
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
          className={cn(TRACK, CONTROL_INVALID, className)}
        />
        <span aria-hidden="true" className={THUMB} />
      </CapIconSlot>
      {hasInline ? (
        <span id={inlineId} className={TEXT}>
          {children}
        </span>
      ) : null}
    </label>
  );
});
