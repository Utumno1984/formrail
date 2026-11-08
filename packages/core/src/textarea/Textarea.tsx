import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type TextareaHTMLAttributes,
} from 'react';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { CONTROL_INVALID, TEXT_CONTROL_BOX } from '../internal/field-control-styles';
import { isDev } from '../internal/is-dev';
import { composeRefs } from '../utils/compose-refs';
import { cn } from '../utils/cn';
import { computeAutoHeight, readLineHeight } from './auto-height';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * The height follows the content: never below `rows`, never above `maxRows` (then the content
   * scrolls inside the control). The manual resize handle is off. Default `false`.
   */
  autoResize?: boolean;
  /** Maximum number of rows with `autoResize`; ignored without it. Below `rows`, `rows` wins. */
  maxRows?: number;
}

// SSR: useLayoutEffect warns on the server (React 18).
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

// Full literals (Tailwind scan). Vertical padding is 7px like `Input` `md`. `break-words`: a long
// token (a pasted URL) wraps inside the control instead of widening the Field.
const BASE = 'py-[7px] break-words';
const RESIZE_MANUAL = 'resize-y';
const RESIZE_AUTO = 'resize-none';
// Lets the scroll that follows a growth stop above the virtual keyboard (same variable as `Field`).
const SCROLL_MARGIN: CSSProperties = { scrollMarginBottom: 'calc(var(--rop-keyboard-inset, 0px) + 0.5rem)' };
const KEYBOARD_INSET = '--rop-keyboard-inset';

/**
 * Multi-line text input. Outside a `Field` it is a styled native `<textarea>`; inside one it takes
 * `id`, `aria-describedby` (merged with its own), `aria-invalid`, `aria-required`, `disabled`,
 * `readOnly` and `aria-readonly` from the Field, exactly like `Input`. Native `readOnly` is what
 * makes a `forced`/`locked` textarea immune to typing, paste, cut, Backspace/Delete and dropped text.
 *
 * Changing `value` from outside never calls `onChange` (`null` from untyped code shows as empty).
 * When the user empties the control, `onChange` reads `''`, never `undefined`.
 */
export const Textarea = /* @__PURE__ */ forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(props, ref) {
  const { autoResize = false, maxRows, rows = 3, className, style, value, ...rest } = props;
  const fieldProps = useFieldControlProps(rest);
  const node = useRef<HTMLTextAreaElement | null>(null);
  const mergedRef = useMemo(() => composeRefs(ref, node), [ref]);
  // Read by the stable `resize` below, so the observers never need re-subscribing.
  const limits = useRef({ rows, maxRows });
  limits.current = { rows, maxRows };

  if (isDev() && autoResize && maxRows !== undefined && maxRows < rows) {
    console.warn(`Textarea: maxRows (${maxRows}) is below rows (${rows}); rows is used as the minimum and the maximum.`);
  }

  const resize = useCallback(() => {
    const el = node.current;
    if (!el) return;
    // Hidden (display: none, a closed tab): nothing to measure; the ResizeObserver calls back when shown.
    if (el.getClientRects().length === 0) return;
    const before = el.offsetHeight;
    const cs = getComputedStyle(el);
    // Measured with `overflow: hidden` so no scrollbar narrows the text or lingers by a rounding pixel.
    el.style.overflowY = 'hidden';
    el.style.height = 'auto';
    const { height, clamped } = computeAutoHeight({
      scrollHeight: el.scrollHeight,
      lineHeight: readLineHeight(cs),
      paddingY: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      borderY: parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth),
      boxSizing: cs.boxSizing,
      rows: limits.current.rows,
      maxRows: limits.current.maxRows,
    });
    el.style.height = `${height}px`;
    el.style.overflowY = clamped ? 'auto' : 'hidden';
    // The visual viewport only fires `resize` when the keyboard moves, not when the field grows
    // under it: scroll the grown control above the keyboard ourselves.
    if (
      el.offsetHeight > before &&
      document.activeElement === el &&
      parseFloat(document.documentElement.style.getPropertyValue(KEYBOARD_INSET)) > 0
    ) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (autoResize) resize();
  }, [autoResize, resize, rows, maxRows, value, className]);

  useEffect(() => {
    const el = node.current;
    if (!autoResize || !el) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // An uncontrolled control changes without a render; a reset restores the text after the event.
    const onInput = () => resize();
    const onReset = () => {
      clearTimeout(timer);
      timer = setTimeout(resize, 0);
    };
    el.addEventListener('input', onInput);
    const form = el.form;
    form?.addEventListener('reset', onReset);
    // Only a change of width re-wraps the text; the height we set ourselves must not loop back.
    let width = el.clientWidth;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (el.clientWidth === width) return;
            width = el.clientWidth;
            resize();
          });
    observer?.observe(el);
    // Web fonts change the line wrapping once loaded.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!cancelled) resize();
      });
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
      el.removeEventListener('input', onInput);
      form?.removeEventListener('reset', onReset);
      observer?.disconnect();
      // Back to the CSS height (autoResize switched off): the inline one would pin the last measure.
      el.style.removeProperty('height');
      el.style.removeProperty('overflow-y');
    };
  }, [autoResize, resize]);

  return (
    <textarea
      {...rest}
      {...fieldProps}
      ref={mergedRef}
      rows={rows}
      // `null` from untyped code would make React warn and flip to uncontrolled.
      value={value === null ? '' : value}
      style={autoResize ? { ...SCROLL_MARGIN, ...style } : style}
      className={cn(TEXT_CONTROL_BOX, CONTROL_INVALID, BASE, autoResize ? RESIZE_AUTO : RESIZE_MANUAL, className)}
    />
  );
});
