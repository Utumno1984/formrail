import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { Button } from '../button/Button';
import { isDev } from '../internal/is-dev';
import { cn } from '../utils/cn';
import { getPaginationRange, toInt } from './pagination-range';

export interface PaginationLabels {
  /** Accessible name of the `<nav>`. Default `Pagination`. */
  navigation?: string;
  /** Name of the previous button. Default `Previous page`. */
  previous?: string;
  /** Name of the next button. Default `Next page`. */
  next?: string;
  /** Name of a page button (localization hook). Default `` `Page ${page}` ``. */
  page?: (page: number) => string;
}

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onChange'> {
  /** Current page, 1-based (controlled). Out of range or invalid values are clamped for display only. */
  page: number;
  /** Total number of pages. `0`, negative or invalid count as a single page. */
  pageCount: number;
  /**
   * Called ONLY by a user gesture, with the requested page. Changing `page` or `pageCount` from
   * outside never calls it, not even to "fix" an out-of-range `page`.
   */
  onPageChange?: (page: number) => void;
  /** Pages shown on each side of the current one. Default 1. */
  siblingCount?: number;
  /** Pages always shown at each end. Default 1. */
  boundaryCount?: number;
  /** Disables every button (e.g. while loading) without changing the size. */
  disabled?: boolean;
  /** Texts for localization. */
  labels?: PaginationLabels;
}

const DEFAULT_LABELS = {
  navigation: 'Pagination',
  previous: 'Previous page',
  next: 'Next page',
  page: (page: number) => `Page ${page}`,
};

// Inline arrows (decorative: the buttons are named by aria-label). Drawn pointing to the inline
// end/start; in RTL they are mirrored so "previous" still points towards the previous page.
function Arrow({ direction }: { direction: 'previous' | 'next' }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0 rtl:[transform:scaleX(-1)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={direction === 'next' ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} />
    </svg>
  );
}

// SSR: useLayoutEffect warns on the server (React 18).
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

// Tight horizontal padding (px-0.5) keeps nine slots of a 3-digit control inside 375px.
// `min-h-8`: the arrow buttons (an svg, no text line box) are as tall as the numeric ones, 32px.
const BUTTON_CLASS = 'min-h-8 px-0.5 font-[500] [font-variant-numeric:tabular-nums]';

/**
 * Standalone, controlled pagination. The number of slots (numbers + ellipses) is constant for every
 * `page`, and each numeric slot has the width of the widest page number (tabular digits), so the
 * control never changes width while paging. When the button that has the focus is disabled or
 * removed by the page change (e.g. "Next" on the last page), the focus moves to the current page.
 */
export const Pagination = /* @__PURE__ */ forwardRef<HTMLElement, PaginationProps>(function Pagination(props, ref) {
  const {
    page: pageProp,
    pageCount: pageCountProp,
    onPageChange,
    siblingCount: siblingProp,
    boundaryCount: boundaryProp,
    disabled = false,
    labels,
    className,
    onFocus,
    onBlur,
    'aria-label': ariaLabel,
    style,
    ...rest
  } = props;

  const text = { ...DEFAULT_LABELS, ...labels };
  const pageCount = Math.max(1, toInt(pageCountProp, 1, 0));
  const page = Math.min(toInt(pageProp, 1, 1), pageCount);
  const siblingCount = toInt(siblingProp, 1, 0);
  const boundaryCount = toInt(boundaryProp, 1, 0);
  const items = useMemo(
    () => getPaginationRange({ page, pageCount, siblingCount, boundaryCount }),
    [page, pageCount, siblingCount, boundaryCount],
  );

  useEffect(() => {
    if (isDev() && page !== pageProp) {
      console.error(
        `[react-object-page] <Pagination page={${String(pageProp)}}> is outside 1..${pageCount}: showing page ${page}. onPageChange is not called to correct it.`,
      );
    }
  }, [page, pageProp, pageCount]);

  // --- focus never lost -------------------------------------------------------------------------
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    lastFocused.current = event.target as HTMLElement;
    onFocus?.(event);
  };
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    // The user left the control (or the focus was moved on): nothing to restore. A button disabled
    // or removed by a re-render is handled by the layout effect below, which runs before any blur
    // the browser may report for it.
    lastFocused.current = null;
    onBlur?.(event);
  };

  useIsomorphicLayoutEffect(() => {
    const el = lastFocused.current;
    if (!el) return;
    const lost = !el.isConnected || (el as HTMLButtonElement).disabled;
    const active = document.activeElement;
    if (lost && (active === null || active === document.body || active === el)) {
      const current = currentRef.current;
      if (current && !current.disabled) {
        current.focus();
      } else {
        lastFocused.current = null;
      }
    }
  });

  // --- rendering --------------------------------------------------------------------------------
  const digits = String(pageCount).length;
  // Every slot is at least as wide as the widest page number, so 9 -> 10 -> 100 never moves anything.
  // Border-box: the digits (tabular, so `ch` is exact for every digit) + the px-0.5 padding + the 1px
  // borders, and never under 2rem (touch target >= 32px).
  const slotStyle = { minWidth: `max(2rem, calc(${digits}ch + 0.25rem + 2px))` };

  // Previous/Next are disabled at the ends and the numbers are within range: no clamping needed.
  const go = (target: number) => {
    if (target !== page) onPageChange?.(target);
  };

  const nodes: ReactNode[] = items.map((item) => {
    if (typeof item !== 'number') {
      return (
        <li key={item} aria-hidden="true" className="list-none">
          <span
            style={slotStyle}
            className="box-border inline-flex min-h-5 items-center justify-center border border-transparent px-0.5 py-[5px] leading-5 text-rop-label font-[500] text-rop-text-muted [font-variant-numeric:tabular-nums]"
          >
            …
          </span>
        </li>
      );
    }
    const current = item === page;
    return (
      <li key={`p${item}`} className="list-none">
        <Button
          ref={current ? (currentRef as never) : undefined}
          size="sm"
          variant={current ? 'primary' : 'ghost'}
          disabled={disabled}
          aria-label={text.page(item)}
          aria-current={current ? 'page' : undefined}
          style={slotStyle}
          className={BUTTON_CLASS}
          onClick={() => go(item)}
        >
          {String(item)}
        </Button>
      </li>
    );
  });

  return (
    <nav
      {...rest}
      ref={ref}
      aria-label={ariaLabel ?? text.navigation}
      style={style}
      className={cn('inline-block max-w-full font-rop-sans', className)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <ul className="m-0 flex flex-wrap items-center gap-0.5 p-0">
        <li className="list-none">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || page <= 1}
            aria-label={text.previous}
            style={slotStyle}
            className={BUTTON_CLASS}
            onClick={() => go(page - 1)}
          >
            <Arrow direction="previous" />
          </Button>
        </li>
        {nodes}
        <li className="list-none">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || page >= pageCount}
            aria-label={text.next}
            style={slotStyle}
            className={BUTTON_CLASS}
            onClick={() => go(page + 1)}
          >
            <Arrow direction="next" />
          </Button>
        </li>
      </ul>
    </nav>
  );
});
