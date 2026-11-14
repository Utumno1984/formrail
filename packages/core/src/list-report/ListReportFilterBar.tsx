import {
  forwardRef,
  useEffect,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type Ref,
} from 'react';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { internalIcons } from '../internal/icons';
import { cn } from '../utils/cn';
import { OpticalLabel } from '../utils/OpticalLabel';
import {
  barClass,
  clearButtonClass,
  groupClass,
  pillClass,
  pillLabelClass,
  searchBoxClass,
  searchFieldClass,
  searchInputClass,
} from './list-report-filter-bar-styles';
import type { UseListReportReturn } from './types';

export type ListReportFilterBarProps<Row> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** What `useListReport` returned: the bar only renders it and calls its setters. */
  table: UseListReportReturn<Row>;
  /**
   * Accessible name of the group of pills.
   * @default 'Filters'
   */
  filtersLabel?: string;
  /**
   * Accessible name of the search box (visually hidden).
   * @default 'Search'
   */
  searchLabel?: string;
  /**
   * Placeholder of the search box.
   * @default `searchLabel`
   */
  searchPlaceholder?: string;
  /**
   * Accessible name of the button that clears the search.
   * @default 'Clear search'
   */
  clearSearchLabel?: string;
  /**
   * Renders the search box.
   * @default true
   */
  showSearch?: boolean;
};

// An array literal, not a `Set`: a module-level `new Set(...)` is not provably pure and would stay in
// the bundle of every export (the bundle budget caught it).
const ARROWS = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];

// `direction` of the element, from CSS or, when the environment does not compute it, the nearest `dir`.
function isRtl(el: Element): boolean {
  const computed = getComputedStyle(el).direction;
  if (computed === 'rtl' || computed === 'ltr') return computed === 'rtl';
  return el.closest('[dir]')?.getAttribute('dir') === 'rtl';
}

const isComposing = (event: KeyboardEvent | globalThis.KeyboardEvent): boolean => {
  const native = 'nativeEvent' in event ? event.nativeEvent : event;
  return native.isComposing || native.keyCode === 229;
};

function ListReportFilterBarImpl<Row>(props: ListReportFilterBarProps<Row>, ref: Ref<HTMLDivElement>) {
  const {
    table,
    filtersLabel = 'Filters',
    searchLabel = 'Search',
    searchPlaceholder,
    clearSearchLabel = 'Clear search',
    showSearch = true,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    ...rest
  } = props;
  const { filters, filter, setFilter, searchDraft, setSearchDraft, commitSearch } = table;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const latest = useRef({ draft: searchDraft, setSearchDraft, commitSearch });
  latest.current = { draft: searchDraft, setSearchDraft, commitSearch };

  const clearSearch = () => {
    const { draft, setSearchDraft: setDraft, commitSearch: commit } = latest.current;
    if (draft === '') return false;
    // Both in one gesture: the rows follow at once, not after the commit delay.
    setDraft('');
    commit();
    inputRef.current?.focus();
    return true;
  };

  // Escape clears a non-empty search and is consumed. A Dialog around the bar closes on a keydown
  // listener of the *document* in the capture phase, which runs before any handler of the input: only
  // a capture listener on the window is earlier. Installed for the bar's lifetime, acts only for
  // Escape typed in its input; with an empty draft it does nothing and the event goes on.
  useEffect(() => {
    if (!showSearch) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.target !== inputRef.current || isComposing(event)) return;
      if (latest.current.draft === '') return;
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [showSearch]);

  // The tab stop is the checked pill; when the checked filter is not (or no longer) there, the first.
  const checkedIndex = filters.findIndex((f) => f.id === filter);
  const tabStop = checkedIndex >= 0 ? checkedIndex : 0;

  const onPillKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!ARROWS.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const pills = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
    const from = pills.indexOf(event.currentTarget);
    const last = pills.length - 1;
    const flip = isRtl(event.currentTarget) ? -1 : 1;
    let to = from;
    if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = last;
    else {
      const step = event.key === 'ArrowRight' ? flip : event.key === 'ArrowLeft' ? -flip : event.key === 'ArrowDown' ? 1 : -1;
      to = (from + step + pills.length) % pills.length;
    }
    if (to === from) return;
    pills[to]?.focus();
    const next = filters[to];
    if (next) setFilter(next.id);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Escape is handled by the window listener above (it must run before a Dialog's).
    if (event.key !== 'Enter' || isComposing(event)) return;
    // Never submits a form around the bar.
    event.preventDefault();
    commitSearch();
  };

  const onSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchDraft(event.target.value);
  };

  // A line break in pasted text is a space (the browser would drop it and glue the words together).
  const onSearchPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!/[\r\n]/.test(text)) return;
    event.preventDefault();
    const input = event.currentTarget;
    const normalized = text.replace(/\s*[\r\n]+\s*/g, ' ');
    // `insertText` keeps the browser's undo history (and fires `input`, so `onChange` does the rest);
    // where it is missing or refuses, the range is replaced by hand.
    if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, normalized)) return;
    input.setRangeText(normalized, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end');
    setSearchDraft(input.value);
  };

  return (
    <div
      role="search"
      aria-label={ariaLabel ?? (ariaLabelledby ? undefined : 'Filters and search')}
      aria-labelledby={ariaLabelledby}
      {...rest}
      ref={ref}
      className={cn(barClass, className)}
    >
      {filters.length > 0 ? (
        <div role="radiogroup" aria-label={filtersLabel} className={groupClass}>
          {filters.map((f, index) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={f.id === filter}
              tabIndex={index === tabStop ? 0 : -1}
              className={pillClass}
              onClick={() => setFilter(f.id)}
              onKeyDown={onPillKeyDown}
            >
              <OpticalLabel className={pillLabelClass}>{f.label}</OpticalLabel>
            </button>
          ))}
        </div>
      ) : null}
      {showSearch ? (
        <Field label={searchLabel} hideLabel reserveMessageSpace={false} className={searchFieldClass}>
          <div className={searchBoxClass}>
            <Input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder={searchPlaceholder ?? searchLabel}
              value={searchDraft}
              className={searchInputClass}
              onChange={onSearchChange}
              onKeyDown={onSearchKeyDown}
              onPaste={onSearchPaste}
            />
            {searchDraft !== '' ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={clearSearchLabel}
                className={clearButtonClass}
                onClick={clearSearch}
              >
                {internalIcons.close}
              </Button>
            ) : null}
          </div>
        </Field>
      ) : null}
    </div>
  );
}

/**
 * The List Report filter bar: single-choice pills and a search box, wired to `useListReport`. No
 * state of its own; everything goes through `table`.
 *
 * - Pills are a `radiogroup` of `role="radio"` buttons with a roving tab stop (the checked pill).
 *   Arrows move the focus **and** select (wrapping), Home/End jump to the ends; Right/Left swap in
 *   `dir="rtl"`. Long labels wrap onto more lines inside the pill (never cut: the full text is always visible, also on touch and from the keyboard).
 *   No `filters`: no group at all.
 * - The search box edits `searchDraft`; Enter commits at once (it never submits an enclosing form,
 *   and is ignored while an IME is composing), otherwise `searchCommitDelay` of the hook does. The
 *   clear button and Escape (with a non-empty draft, consumed so that a Dialog around the bar stays
 *   open) empty draft and committed query together and keep the focus in the input.
 * - The search box is a `Field` + `Input`: it keeps itself clear of the on-screen keyboard.
 * - The bar is a `search` landmark; name it with `aria-label` / `aria-labelledby` (default "Filters and search").
 * - From 640px the search box is a 18rem column next to the pills; below, it takes the whole row.
 */
export const ListReportFilterBar = /* @__PURE__ */ forwardRef(ListReportFilterBarImpl) as <Row>(
  props: ListReportFilterBarProps<Row> & {
    /** The bar's root (the `role="search"` landmark). */
    ref?: Ref<HTMLDivElement>;
  },
) => ReactElement | null;
