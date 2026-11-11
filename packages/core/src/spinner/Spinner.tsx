import { forwardRef, useEffect, useRef, type HTMLAttributes } from 'react';
import { isDev } from '../internal/is-dev';
import { cn } from '../utils/cn';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Full literals (Tailwind scan). The pixel values live in tokens.css (`--icon-rop-*`).
const SIZE_CLASS: Record<SpinnerSize, string> = {
  xs: 'size-(--icon-rop-xs)',
  sm: 'size-(--icon-rop-sm)',
  md: 'size-(--icon-rop-md)',
  lg: 'size-(--icon-rop-lg)',
  xl: 'size-(--icon-rop-xl)',
};

export interface SpinnerProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'role' | 'aria-hidden' | 'aria-live' | 'aria-atomic'> {
  /** Side of the square box, from the icon scale (`--icon-rop-*`). Default `md`. */
  size?: SpinnerSize;
  /**
   * Text announced to assistive technology (announced mode only). Default "Loading". An empty label
   * leaves the region empty and logs an error in development.
   */
  label?: string;
  /**
   * Decorative mode: `aria-hidden`, no role and no text. Use it inside a button or a container that
   * already communicates the busy state (e.g. `aria-busy`).
   */
  decorative?: boolean;
}

/**
 * Loading indicator of unknown duration: an inline SVG that inherits the text colour (`currentColor`)
 * and rotates under `motion-safe:` only (a static ring-with-arc under `prefers-reduced-motion`).
 *
 * Announced mode (default) renders a `role="status"` region that is mounted EMPTY; its text is
 * inserted on the next animation frame, so the announcement is an update of a region that already
 * exists in the DOM (a region created together with its text is often not read). The text is written
 * only when `label` changes, never on a plain re-render. Every announced spinner owns its own region:
 * for a section with many spinners prefer `decorative` on each plus a single status message.
 * `role`, `aria-hidden`, `aria-live` and `aria-atomic` are controlled by the component. The frame
 * callback does not fire in a background tab, so the announcement waits until the tab is visible.
 */
export const Spinner = /* @__PURE__ */ forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 'md', label = 'Loading', decorative = false, className, ...rest },
  ref,
) {
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (decorative) return;
    // Same rule as Icon: empty, whitespace-only or non-string (a JS consumer's `null`) is "no label".
    const text = typeof label === 'string' && label.trim() !== '' ? label : '';
    if (text === '' && isDev()) {
      console.error('[formrail] <Spinner> has an empty label: nothing is announced. Pass a label or use `decorative`.');
    }
    const frame = requestAnimationFrame(() => {
      // The text span is written imperatively and only here: React never owns its content, so a
      // re-render with the same label produces no DOM mutation at all.
      if (textRef.current) textRef.current.textContent = text;
    });
    // Unmounted (or label changed) before the frame: no update after unmount.
    return () => cancelAnimationFrame(frame);
  }, [label, decorative]);

  return (
    <span
      {...rest}
      ref={ref}
      // The semantics are ours and come AFTER the spread: a stray `aria-hidden` would hide the
      // status region (the announcement would silently die), a `role` / `aria-live` would break it.
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative ? true : undefined}
      aria-live={undefined}
      aria-atomic={undefined}
      className={cn('relative inline-block shrink-0 align-middle', SIZE_CLASS[size], className)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="block size-full motion-safe:animate-rop-spinner"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {decorative ? null : <span ref={textRef} className="sr-only" />}
    </span>
  );
});
