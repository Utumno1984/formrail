import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { FieldMessage } from '../field-message/FieldMessage';
import { defineHidden } from '../internal/define-hidden';
import { isDev } from '../internal/is-dev';
import { hasContent } from '../internal/react-nodes';
import { errorAt } from '../object-page/field-errors';
import { cn } from '../utils/cn';
import { FieldContext, type FieldControlProps } from './FieldContext';
import { ValidationContext } from './ValidationContext';

/**
 * `forced`: the value is decided by a business rule. `locked`: not editable because of
 * permissions or the record's status. Same interaction (focusable, read-only), so the reason is
 * required in both; `disabled` may have one. In `default` there is none.
 */
export type FieldStateProps =
  | { state?: 'default'; stateReason?: never }
  | { state: 'disabled'; stateReason?: ReactNode }
  | { state: 'forced' | 'locked'; stateReason: ReactNode };

export type FieldProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'id'> &
  FieldStateProps & {
    /** Accessible name of the control. A required marker is added visually, never to the name. */
    label: ReactNode;
    help?: ReactNode;
    /**
     * Logical name of the field (the key used in the form's errors). Exposed on the control as
     * `data-rop-name` (all controls, `Select` included) and, on `Input` and `Combobox`, also as the
     * native `name` unless they get their own. Never set on the Field's `<div>`. Inside a
     * `ValidationProvider` it is also the path whose error the Field shows (exact match).
     */
    name?: string;
    /**
     * Non-empty: the control gets `aria-invalid`. Empty is the same as absent. With content it wins
     * over the error of a `ValidationProvider`; empty or absent, the provider's (if any) is used.
     * A provider value other than `undefined` always sets `aria-invalid` (same rule as the form),
     * even if blank; the message is rendered only when it has content (blank: `console.error` in dev).
     */
    error?: ReactNode;
    required?: boolean;
    /**
     * Default `true`: the Field always reserves one caption line for its error, even with no
     * error and whatever reason or help it shows, so a one-line error appearing later moves
     * nothing below it (a wrapped error still grows it). Set `false` for a Field that never shows
     * an error (e.g. a search box) or sits inline and must not take that room.
     */
    reserveMessageSpace?: boolean;
    /**
     * Hides the label visually (it stays in the DOM as the accessible name, `sr-only`). For controls
     * that already show what they are, e.g. a search box with a placeholder.
     */
    hideLabel?: boolean;
    /** Id of the control (the label's `htmlFor`). Default: generated. */
    id?: string;
    /** A node, or a render-prop to wire any control by hand: `(control) => <X {...control} />`. */
    children: ReactNode | ((control: FieldControlProps) => ReactNode);
  };

// Full literals (Tailwind scan). The scroll margin (inline: it reads a runtime variable) lets
// scrollIntoView stop above the virtual keyboard.
const ROOT = 'flex min-w-0 flex-col font-rop-sans';
const SCROLL_MARGIN = { scrollMarginTop: '0.5rem', scrollMarginBottom: 'calc(var(--rop-keyboard-inset, 0px) + 0.5rem)' };
// The error slot always holds one caption line plus the gap of the message (`mt-2` = 0.5rem, a
// literal on purpose: the design system exposes no global spacing variable), whatever else the Field shows (reason, help): a
// one-line error appearing or going away moves nothing below the Field. A wrapped error grows it:
// accepted, never clamped. Reason and help are static descriptions of the field's configuration,
// not transient feedback: they take room only while present (reserving them too would add three
// empty lines under every Field).
const ERROR_SLOT = 'min-h-[calc(var(--text-rop-caption--line-height)+0.5rem)]';
const LABEL_HIDDEN = 'sr-only';
const LABEL = 'mb-2 text-rop-label text-rop-text [overflow-wrap:anywhere]';
const KEYBOARD_INSET = '--rop-keyboard-inset';

/**
 * While focus is inside the Field, keeps it clear of the on-screen keyboard (spec §1.10). The
 * keyboard shrinks the visual viewport, not the layout one, so media queries and `vh` do not see
 * it: the covered height is published as `--rop-keyboard-inset` on <html> (consumers can pad their
 * scroll container with it) and, if the Field is not inside the visual viewport, it is scrolled
 * into view. Re-run on every visual-viewport resize (the keyboard animates in after the focus).
 */
function useKeyboardSafe(active: boolean, ref: RefObject<HTMLElement | null>, onFocusLost: () => void) {
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!active || !vv) return undefined;
    const root = document.documentElement;
    let published = '';
    const ensureVisible = () => {
      const el = ref.current;
      if (!el) return;
      // The focused control may have been unmounted or disabled with no focusout event (Safari): stop here.
      if (!el.contains(document.activeElement)) {
        onFocusLost();
        return;
      }
      // Pinch-zoom also resizes the visual viewport: the arithmetic below is for scale 1 only.
      if (vv.scale !== 1) return;
      const covered = `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`;
      if (covered !== published) {
        published = covered;
        root.style.setProperty(KEYBOARD_INSET, covered);
      }
      const rect = el.getBoundingClientRect();
      if (rect.top < vv.offsetTop || rect.bottom > vv.offsetTop + vv.height) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };
    ensureVisible();
    vv.addEventListener('resize', ensureVisible);
    return () => {
      vv.removeEventListener('resize', ensureVisible);
      root.style.removeProperty(KEYBOARD_INSET);
    };
  }, [active, ref, onFocusLost]);
}

/**
 * Container of a form control: label, help, error and state reason, and the ARIA wiring.
 * `Input` inside a Field connects itself; any other control takes the props from the render-prop
 * or from `useFieldControl()`. `aria-describedby` lists exactly the messages that are rendered:
 * reason, then error, then help.
 */
export function Field(props: FieldProps) {
  const {
    label,
    help,
    name,
    error,
    required,
    reserveMessageSpace = true,
    hideLabel,
    id: idProp,
    state = 'default',
    stateReason,
    children,
    className,
    style,
    onFocus,
    onBlur,
    ...rest
  } = props;
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const onFocusLost = useCallback(() => setFocused(false), []);
  useKeyboardSafe(focused, rootRef, onFocusLost);

  const hasReason = state !== 'default' && hasContent(stateReason);
  // An explicit error with content wins; otherwise the nearest ValidationProvider's, by exact path.
  // From the provider, "invalid" follows the form's rule (`invalidPaths`: anything but `undefined`),
  // so a path that blocks the save is never shown as valid; the message node (and its id in
  // aria-describedby) exists only when it has content.
  const fieldErrors = useContext(ValidationContext);
  const explicitError = hasContent(error);
  const providerError = !explicitError && name && fieldErrors ? errorAt(fieldErrors, name) : undefined;
  const shownError = explicitError ? error : providerError;
  const hasError = hasContent(shownError);
  const invalid = explicitError || providerError !== undefined;
  const emptyProviderError = providerError !== undefined && !hasError;
  useEffect(() => {
    if (emptyProviderError && isDev()) {
      console.error(
        `[react-object-page] Field "${name}": the ValidationProvider error for this path is empty or blank. The control is marked aria-invalid (the form treats the path as invalid), but no message is shown: give it a text.`,
      );
    }
  }, [emptyProviderError, name]);
  const hasHelp = hasContent(help);
  const labelId = `${id}-label`;
  const reasonId = `${id}-reason`;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const describedBy = [hasReason && reasonId, hasError && errorId, hasHelp && helpId].filter(Boolean).join(' ');
  const readOnly = state === 'forced' || state === 'locked';

  const control = useMemo(() => {
    const c = defineHidden({ id, 'aria-labelledby': labelId } as FieldControlProps, {
      state,
      interactionBlocked: state !== 'default',
    });
    // Assigned only when set: an absent key cannot override the control's own prop on spread.
    if (describedBy) c['aria-describedby'] = describedBy;
    if (name) c['data-rop-name'] = name;
    if (invalid) c['aria-invalid'] = true;
    if (required) c['aria-required'] = true;
    if (state === 'disabled') c.disabled = true;
    if (readOnly) {
      c.readOnly = true;
      c['aria-readonly'] = true;
    }
    return c;
  }, [id, labelId, name, state, describedBy, invalid, required, readOnly]);

  return (
    <FieldContext.Provider value={control}>
      <div
        {...rest}
        ref={rootRef}
        data-state={state}
        className={cn(ROOT, className)}
        style={{ ...SCROLL_MARGIN, ...style }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
          onBlur?.(event);
        }}
      >
        <label id={labelId} htmlFor={id} className={hideLabel ? LABEL_HIDDEN : LABEL}>
          {label}
          {required ? (
            <span aria-hidden="true" className="ms-0.5 text-rop-error">
              *
            </span>
          ) : null}
        </label>
        {typeof children === 'function' ? children(control) : children}
        {hasReason ? (
          <FieldMessage id={reasonId} tone="help" data-field-reason={state}>
            {stateReason}
          </FieldMessage>
        ) : null}
        <FieldMessage id={helpId} tone="help">
          {help}
        </FieldMessage>
        {/* Last, so reason and help stay next to their control and the reserved room reads as the gap to the next field. */}
        <div data-field-error-slot="" className={reserveMessageSpace ? ERROR_SLOT : undefined}>
          <FieldMessage id={errorId} tone="error">
            {shownError}
          </FieldMessage>
        </div>
      </div>
    </FieldContext.Provider>
  );
}
