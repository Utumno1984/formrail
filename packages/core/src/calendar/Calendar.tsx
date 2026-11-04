import {
  forwardRef,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { Button } from '../button/Button';
import { FieldContext } from '../field/FieldContext';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { isDev } from '../internal/is-dev';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import {
  addMonthsToMonth,
  clampMonth,
  dayInMonth,
  getFocusableDate,
  getKeyboardTarget,
  getMonthGrid,
  isDateSelectable,
  isGridNavigationKey,
  isIsoDate,
  isIsoMonth,
  isMonthNavigable,
  limitsConflict,
  localToday,
  monthOf,
  type DateLimits,
  type IsoDate,
  type IsoMonth,
  type Weekday,
} from './date-math';
import { createCalendarFormatters, getWeekStartsOn, resolveLocale } from './locale';

export type { IsoDate, IsoMonth, Weekday } from './date-math';

/** Texts of the calendar (spec §1.13.3: English defaults, merged key by key with `labels`). */
export interface CalendarLabels {
  /** Name of the previous-month button. Default `Previous month`. */
  previousMonth: string;
  /** Name of the next-month button. Default `Next month`. */
  nextMonth: string;
}

const DEFAULT_LABELS: CalendarLabels = { previousMonth: 'Previous month', nextMonth: 'Next month' };

export interface CalendarProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'children' | 'role' | 'aria-readonly' | 'aria-required' | 'aria-invalid'> {
  /**
   * Controlled selection, a calendar date `YYYY-MM-DD`. `null` (or `undefined` passed explicitly:
   * `'value' in props` makes the calendar controlled, as for `Select`/`Combobox`) = nothing selected.
   * An invalid string (`'2026-02-30'`, `''`, another format) is shown as no selection, with a
   * `console.error` in development. Changing it from outside never calls `onValueChange` nor
   * `onMonthChange`; when the new date is outside the visible month and `month` is not controlled,
   * the calendar shows the month of the new date.
   */
  value?: IsoDate | null | undefined;
  /** Initial selection when uncontrolled. */
  defaultValue?: IsoDate | undefined;
  /**
   * Called **only** when the user selects a selectable date (click, Enter, Space), with its ISO
   * string. Never for an external `value`, never when the date is already selected. The user cannot
   * clear the selection: the empty value (`undefined`, as `Select`) is never emitted by `Calendar`.
   */
  onValueChange?: ((value: IsoDate) => void) | undefined;
  /** Controlled visible month, `YYYY-MM`. */
  month?: IsoMonth | undefined;
  /**
   * Initial visible month when uncontrolled. Default: the month of the selection, else the month of
   * `today` moved inside `min`/`max`.
   */
  defaultMonth?: IsoMonth | undefined;
  /** Called only when the USER changes month (buttons, keyboard), never for an external `value`/`month`. */
  onMonthChange?: ((month: IsoMonth) => void) | undefined;
  /** First selectable date (inclusive). Months entirely before it cannot be reached. */
  min?: IsoDate | undefined;
  /** Last selectable date (inclusive). `min > max`: nothing is selectable (`console.error`). */
  max?: IsoDate | undefined;
  /** Dates that cannot be selected. They stay reachable with the keyboard, so the focus is never trapped. */
  isDateDisabled?: ((date: IsoDate) => boolean) | undefined;
  /**
   * The date marked `aria-current="date"`. Default: today in the runtime's local time zone, read once
   * at mount. Pass it when rendering on the server (the server's "today" can differ from the
   * browser's around midnight, which would be a hydration mismatch) and in tests/stories.
   */
  today?: IsoDate | undefined;
  /**
   * BCP 47 locale of the month and day names. Default: the runtime's (`undefined` to `Intl`). With
   * SSR pass it explicitly: the server's default locale can differ from the browser's.
   */
  locale?: string | undefined;
  /**
   * First day of the week, 0 = Sunday ... 6 = Saturday. Default, from `locale`:
   * `Intl.Locale#getWeekInfo()`/`weekInfo` where the engine has it, else a CLDR table by region,
   * else Monday.
   */
  weekStartsOn?: Weekday | undefined;
  /** No interaction at all and out of the tab order. A disabled `Field` does the same. */
  disabled?: boolean | undefined;
  /**
   * Navigable (Tab, arrows, month buttons) but nothing can be selected. A `forced`/`locked` `Field`
   * does the same.
   */
  readOnly?: boolean | undefined;
  /** Texts, merged with the English defaults. */
  labels?: Partial<CalendarLabels> | undefined;
}

// Full literals (Tailwind scan). Logical properties only (spec §1.13.4).
// `self-start`: keeps its intrinsic width inside a stretching flex column (a Field), so the columns
// stay 40px wide.
const ROOT =
  'inline-flex max-w-full self-start flex-col gap-2 rounded-rop-md border border-rop-border bg-rop-surface p-3 ' +
  'font-rop-sans text-rop-body text-rop-text';
const HEADER = 'flex items-center gap-2';
const HEADING = 'min-w-0 flex-1 text-center text-rop-title-sm font-[600] [overflow-wrap:anywhere]';
const GRID = 'm-0 border-separate [border-spacing:0] [table-layout:fixed]';
const TH = 'h-8 w-10 p-0 text-center align-middle text-rop-caption font-[500] text-rop-text-muted';
// Every cell is 40×40 (the touch target) and every grid has 6 rows: the height never changes.
const CELL = 'h-10 w-10 p-0 text-center align-middle';
const DAY_CELL =
  'group/day rounded-rop-md focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-[-2px]';
const DAY =
  'pointer-events-none inline-flex h-8 w-8 items-center justify-center rounded-rop-md border border-transparent ' +
  '[font-variant-numeric:tabular-nums]';
const DAY_HOVER = 'cursor-pointer group-hover/day:bg-rop-surface-subtle';
const DAY_SELECTED =
  'bg-rop-primary font-[600] text-rop-primary-contrast forced-colors:border-[Highlight]';
const DAY_TODAY = 'font-[600] underline underline-offset-2';
const DAY_TODAY_UNSELECTED = 'border-rop-primary text-rop-primary forced-colors:border-[CanvasText]';
const DAY_UNAVAILABLE = 'text-rop-text-muted line-through';

// SSR: useLayoutEffect warns on the server (React 18).
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

// Decorative arrows (the buttons are named by aria-label), mirrored in RTL so "previous" still points
// back. The direction comes from the computed style (a `rtl:` variant would emit a global selector).
function Arrow({ direction, rtl }: { direction: 'previous' | 'next'; rtl: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('size-4 shrink-0', rtl && '[transform:scaleX(-1)]')}
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

const PREFIX = '[react-object-page] <Calendar>';
const isWeekday = (n: unknown): n is Weekday => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6;
/** `undefined`/`null` are "absent", never an error; any other non-ISO value is. */
const invalidDate = (v: unknown) => v !== undefined && v !== null && !isIsoDate(v);

/**
 * Calendar: an inline month grid to pick one date, following the generic "date picker grid" pattern.
 *
 * - Values are calendar dates (`IsoDate`, `YYYY-MM-DD`), computed with integer arithmetic (never local
 *   hours), so a selection never shifts by a day across time zones or daylight saving changes.
 * - One tab stop in the grid (roving tabindex): the selected date, else today, else the first
 *   selectable day of the month. Arrows ±1 day / ±1 week, Home/End start/end of the week,
 *   PageUp/PageDown ±1 month, Shift+PageUp/PageDown ±1 year (clamped to the last valid day),
 *   Enter/Space select. Left/right are swapped when the computed `direction` is `rtl` (best effort,
 *   RTL is not guaranteed: spec §1.13.4).
 * - Unselectable dates (`min`, `max`, `isDateDisabled`) are reachable but not selectable; months
 *   entirely outside `min`/`max` cannot be reached.
 * - The grid always has 6 rows. The month heading is a polite live region mounted from the start.
 * - Inside a `Field`, the container (`role="group"`) gets the Field's `id`, `aria-labelledby`,
 *   `aria-describedby` (so the error message is read); the grid gets `aria-readonly` for
 *   `forced`/`locked`; the Field's `data-rop-name` is on the tab-stop day (what
 *   `useFocusFirstInvalidField` focuses). `required`/`invalid` are not exposed as
 *   `aria-required`/`aria-invalid`: in ARIA 1.2 neither `group` nor `grid` supports them. An invalid
 *   Field shows an error border; the error text is part of the description.
 */
export const Calendar = /* @__PURE__ */ forwardRef<HTMLDivElement, CalendarProps>(function Calendar(props, ref) {
  const {
    value: valueProp,
    defaultValue,
    onValueChange,
    month: monthProp,
    defaultMonth,
    onMonthChange,
    min: minProp,
    max: maxProp,
    isDateDisabled,
    today: todayProp,
    locale: localeProp,
    weekStartsOn: weekStartsOnProp,
    disabled: ownDisabled,
    readOnly: ownReadOnly,
    labels,
    className,
    id: ownId,
    'aria-labelledby': ownLabelledBy,
    'aria-describedby': ownDescribedBy,
    ...rest
  } = props;
  const valueControlled = 'value' in props;
  const monthControlled = monthProp !== undefined;

  const control = useContext(FieldContext);
  const fieldProps = useFieldControlProps({
    id: ownId,
    'aria-labelledby': ownLabelledBy,
    'aria-describedby': ownDescribedBy,
    disabled: ownDisabled,
    readOnly: ownReadOnly,
  });
  const disabled = fieldProps.disabled === true;
  const readOnly = !disabled && (fieldProps.readOnly === true || control?.interactionBlocked === true);
  const fieldName = fieldProps['data-rop-name'];
  const invalid = control?.['aria-invalid'] === true;

  const text: CalendarLabels = {
    previousMonth: labels?.previousMonth ?? DEFAULT_LABELS.previousMonth,
    nextMonth: labels?.nextMonth ?? DEFAULT_LABELS.nextMonth,
  };

  // --- inputs, validated ------------------------------------------------------------------------
  const [mountToday] = useState(localToday);
  const today = isIsoDate(todayProp) ? todayProp : mountToday;
  const min = isIsoDate(minProp) ? minProp : undefined;
  const max = isIsoDate(maxProp) ? maxProp : undefined;
  const limits: DateLimits = { min, max, isDateDisabled };
  const locale = resolveLocale(localeProp);
  const formatters = useMemo(() => createCalendarFormatters(locale), [locale]);
  const weekStartsOn = useMemo(
    () => (isWeekday(weekStartsOnProp) ? weekStartsOnProp : getWeekStartsOn(locale)),
    [weekStartsOnProp, locale],
  );

  const [internalValue, setInternalValue] = useState<IsoDate | null>(() =>
    isIsoDate(defaultValue) ? defaultValue : null,
  );
  const selected: IsoDate | null = valueControlled ? (isIsoDate(valueProp) ? valueProp : null) : internalValue;

  const [internalMonth, setInternalMonth] = useState<IsoMonth>(() => {
    if (isIsoMonth(defaultMonth)) return defaultMonth;
    if (selected) return monthOf(selected);
    return clampMonth(monthOf(today), { min, max });
  });
  const visibleMonth: IsoMonth = monthControlled && isIsoMonth(monthProp) ? monthProp : internalMonth;

  // An external selection outside the visible month brings its month into view (uncontrolled month
  // only), during render so there is no frame on the old month, and without any callback (no echo).
  const [previousSelected, setPreviousSelected] = useState(selected);
  if (previousSelected !== selected) {
    setPreviousSelected(selected);
    if (selected && !monthControlled && monthOf(selected) !== internalMonth) setInternalMonth(monthOf(selected));
  }

  useEffect(() => {
    if (!isDev()) return;
    if (valueControlled && invalidDate(valueProp)) {
      console.error(`${PREFIX} \`value\` ${JSON.stringify(valueProp)} is not a valid ISO date (YYYY-MM-DD): nothing is selected.`);
    }
  }, [valueControlled, valueProp]);
  useEffect(() => {
    if (!isDev()) return;
    for (const [name, v] of [
      ['defaultValue', defaultValue],
      ['min', minProp],
      ['max', maxProp],
      ['today', todayProp],
    ] as const) {
      if (invalidDate(v)) console.error(`${PREFIX} \`${name}\` ${JSON.stringify(v)} is not a valid ISO date (YYYY-MM-DD): it is ignored.`);
    }
    for (const [name, v] of [
      ['month', monthProp],
      ['defaultMonth', defaultMonth],
    ] as const) {
      if (v !== undefined && !isIsoMonth(v)) console.error(`${PREFIX} \`${name}\` ${JSON.stringify(v)} is not a valid ISO month (YYYY-MM): it is ignored.`);
    }
    if (weekStartsOnProp !== undefined && !isWeekday(weekStartsOnProp)) {
      console.error(`${PREFIX} \`weekStartsOn\` ${JSON.stringify(weekStartsOnProp)} is not an integer 0-6: derived from the locale instead.`);
    }
    if (valueControlled && defaultValue !== undefined) {
      console.error(`${PREFIX} received both \`value\` and \`defaultValue\`: \`value\` wins and \`defaultValue\` is ignored.`);
    }
  }, [defaultValue, minProp, maxProp, todayProp, monthProp, defaultMonth, weekStartsOnProp, valueControlled]);
  useEffect(() => {
    if (isDev() && limitsConflict({ min, max })) {
      console.error(`${PREFIX} \`min\` (${min}) is after \`max\` (${max}): no date can be selected.`);
    }
  }, [min, max]);

  // --- focus ------------------------------------------------------------------------------------
  const [focused, setFocused] = useState<IsoDate | null>(null);
  const [focusInside, setFocusInside] = useState(false);
  // While the focus is in the grid and the month changes from outside, it stays on the same day
  // number of the new month (or its last day); otherwise the default tab stop applies.
  const tabStop: IsoDate =
    focused && monthOf(focused) === visibleMonth
      ? focused
      : focusInside && focused
        ? dayInMonth(visibleMonth, Number(focused.slice(8)))
        : getFocusableDate(visibleMonth, { selected, today, limits });

  const container = useRef<HTMLDivElement | null>(null);
  const mergedRef = useMemo(() => composeRefs(ref, container), [ref]);
  const gridRef = useRef<HTMLTableElement | null>(null);
  const previousRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const pendingButtonFocus = useRef<'previous' | 'next' | null>(null);

  const [rtl, setRtl] = useState(false);
  useIsomorphicLayoutEffect(() => {
    const node = container.current;
    if (node) setRtl(getComputedStyle(node).direction === 'rtl');
  });

  // Keeps the DOM focus on the tab stop while the focus is in the grid (keyboard moves, a month
  // changed from outside). Cells are keyed by position, so the focused cell is reused, not removed.
  useIsomorphicLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || disabled) return;
    const active = document.activeElement;
    if (!grid.contains(active) && !focusInside) return;
    const cell = grid.querySelector<HTMLElement>(`[data-iso="${tabStop}"]`);
    if (cell && cell !== active) cell.focus();
  });
  // A month button disabled by its own click (end of the range) would drop the focus on <body>.
  useIsomorphicLayoutEffect(() => {
    const target = pendingButtonFocus.current;
    if (!target) return;
    pendingButtonFocus.current = null;
    const button = target === 'previous' ? previousRef.current : nextRef.current;
    if (button && !button.disabled) button.focus();
  });

  // --- actions ----------------------------------------------------------------------------------
  const goToMonth = (next: IsoMonth) => {
    if (next === visibleMonth) return;
    if (!monthControlled) setInternalMonth(next);
    onMonthChange?.(next);
  };
  const canReach = (month: IsoMonth | null): month is IsoMonth => month !== null && isMonthNavigable(month, { min, max });
  const previousMonth = addMonthsToMonth(visibleMonth, -1);
  const nextMonth = addMonthsToMonth(visibleMonth, 1);
  const canPrevious = !disabled && canReach(previousMonth);
  const canNext = !disabled && canReach(nextMonth);

  const select = (date: IsoDate) => {
    if (disabled || readOnly || date === selected || !isDateSelectable(date, limits)) return;
    if (!valueControlled) setInternalValue(date);
    onValueChange?.(date);
  };

  const dateOf = (target: EventTarget | null): IsoDate | null => {
    const cell = (target as HTMLElement | null)?.closest?.('[data-iso]');
    return (cell?.getAttribute('data-iso') as IsoDate | undefined) ?? null;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (disabled) return;
    const from = dateOf(event.target);
    if (!from) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(from);
      return;
    }
    if (!isGridNavigationKey(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const target = getKeyboardTarget(from, event.key, { shift: event.shiftKey, rtl, weekStartsOn });
    if (!target) return;
    const month = monthOf(target);
    if (month !== visibleMonth && !canReach(month)) return;
    setFocused(target);
    goToMonth(month);
  };
  const handleClick = (event: MouseEvent<HTMLTableElement>) => {
    const date = dateOf(event.target);
    if (date) select(date);
  };
  const handleFocus = (event: FocusEvent<HTMLTableElement>) => {
    const date = dateOf(event.target);
    if (date) setFocused(date);
    setFocusInside(true);
  };
  const handleBlur = (event: FocusEvent<HTMLTableElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false);
  };
  const clickMonth = (direction: 'previous' | 'next') => {
    const month = direction === 'previous' ? previousMonth : nextMonth;
    if (!canReach(month)) return;
    const after = addMonthsToMonth(month, direction === 'previous' ? -1 : 1);
    if (!canReach(after)) pendingButtonFocus.current = direction === 'previous' ? 'next' : 'previous';
    goToMonth(month);
  };

  // --- rendering --------------------------------------------------------------------------------
  const headingId = `${useId()}-month`;
  const rows = getMonthGrid(visibleMonth, weekStartsOn);
  const weekdays = Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday);
  const interactive = !disabled && !readOnly;

  return (
    <div
      {...rest}
      ref={mergedRef}
      role="group"
      id={fieldProps.id}
      aria-labelledby={fieldProps['aria-labelledby']}
      aria-describedby={fieldProps['aria-describedby']}
      aria-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
      className={cn(ROOT, invalid && 'border-rop-error', disabled && 'opacity-50', className)}
    >
      <div className={HEADER}>
        <Button
          ref={previousRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={text.previousMonth}
          disabled={!canPrevious}
          onClick={() => clickMonth('previous')}
        >
          <Arrow direction="previous" rtl={rtl} />
        </Button>
        <div id={headingId} aria-live="polite" className={HEADING}>
          {formatters.month(visibleMonth)}
        </div>
        <Button
          ref={nextRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={text.nextMonth}
          disabled={!canNext}
          onClick={() => clickMonth('next')}
        >
          <Arrow direction="next" rtl={rtl} />
        </Button>
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={headingId}
        aria-readonly={readOnly || undefined}
        aria-disabled={disabled || undefined}
        className={GRID}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        <thead>
          <tr>
            {weekdays.map((weekday) => (
              <th key={weekday} scope="col" aria-label={formatters.weekdayLong(weekday)} className={TH}>
                {formatters.weekdayShort(weekday)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((date, c) => {
                if (!date) return <td key={c} className={CELL} />;
                const isSelected = date === selected;
                const isToday = date === today;
                const selectable = isDateSelectable(date, limits);
                return (
                  <td
                    key={c}
                    role="gridcell"
                    data-iso={date}
                    data-rop-name={date === tabStop ? fieldName : undefined}
                    aria-label={formatters.fullDate(date)}
                    aria-selected={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-disabled={!selectable || undefined}
                    tabIndex={disabled ? undefined : date === tabStop ? 0 : -1}
                    className={cn(CELL, !disabled && DAY_CELL, interactive && !selectable && 'cursor-not-allowed')}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        DAY,
                        interactive && selectable && !isSelected && DAY_HOVER,
                        isToday && DAY_TODAY,
                        isToday && !isSelected && DAY_TODAY_UNSELECTED,
                        !selectable && !isSelected && DAY_UNAVAILABLE,
                        isSelected && DAY_SELECTED,
                      )}
                    >
                      {formatters.day(date)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
