import {
  forwardRef,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Button } from '../button/Button';
import { Calendar, type CalendarLabels } from '../calendar/Calendar';
import { isIsoDate, limitsConflict, type IsoDate, type Weekday } from '../calendar/date-math';
import { resolveLocale, toUtcDate } from '../calendar/locale';
import { FieldContext } from '../field/FieldContext';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { Icon } from '../icon/Icon';
import { Input, type InputSize } from '../input/Input';
import { isDev } from '../internal/is-dev';
import { overlayLayer } from '../overlay/layers';
import { useReturnFocus } from '../overlay/use-return-focus';
import { cn } from '../utils/cn';
import { formatDateText, getDateTextFormat, parseDateText } from './date-format';

export type DatePickerSize = InputSize;

/** Why a typed text was not accepted as a date (see `onInvalidInput`). */
export type DatePickerInvalidReason = 'unparsable' | 'out-of-range' | 'disabled-date';

/** Texts of the DatePicker (spec §1.13.3: English defaults, merged key by key with `labels`). */
export interface DatePickerLabels extends CalendarLabels {
  /** Name of the calendar button with nothing selected, and of the calendar popover. Default `Choose date`. */
  chooseDate: string;
  /**
   * Name of the calendar button with a date selected, from that date written out in the locale
   * ("March 3, 2026"). Default `Choose date, selected March 3, 2026`.
   */
  chooseDateSelected: (date: string) => string;
}

const DEFAULT_LABELS: DatePickerLabels = {
  chooseDate: 'Choose date',
  chooseDateSelected: (date) => `Choose date, selected ${date}`,
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
};

export interface DatePickerProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'size' | 'type' | 'min' | 'max' | 'children' | 'role'
  > {
  /**
   * Controlled value, a calendar date `YYYY-MM-DD`. `null` (or `undefined` passed explicitly:
   * `'value' in props` makes it controlled, as for `Calendar`) = no date, an empty text. An invalid
   * string is shown as no date, with a `console.error` in development. Changing it from outside
   * (async hydration included) rewrites the text, even while the user is typing, and never calls
   * `onValueChange`.
   */
  value?: IsoDate | null | undefined;
  /** Initial value when uncontrolled. */
  defaultValue?: IsoDate | undefined;
  /**
   * Called **only** for a user gesture that changes the value: a date picked in the calendar, or a
   * typed text committed (focus leaving the input, Enter) that differs from the value. The empty value is `null`
   * (emptying the text). A committed text that is not an acceptable date also gives `null` (the form
   * never keeps a valid date different from the one the user sees) followed by `onInvalidInput`;
   * the text stays as typed, to be corrected. Never called when `value` or `locale` change from
   * outside, when the popover opens or closes, or when the focus leaves an unedited input.
   */
  onValueChange?: ((value: IsoDate | null) => void) | undefined;
  /**
   * Called when a committed text is not accepted: `'unparsable'` (not a date in the locale's
   * numeric order with a 4-digit year, nor an ISO date), `'out-of-range'` (before `min`, after
   * `max`, or `min > max`), `'disabled-date'` (`isDateDisabled`). Showing a message is the
   * consumer's (e.g. a Field `error` from its validation).
   */
  onInvalidInput?: ((text: string, reason: DatePickerInvalidReason) => void) | undefined;
  /** First selectable date (inclusive), also for typed text. */
  min?: IsoDate | undefined;
  /** Last selectable date (inclusive), also for typed text. */
  max?: IsoDate | undefined;
  /** Dates that cannot be selected, also for typed text. */
  isDateDisabled?: ((date: IsoDate) => boolean) | undefined;
  /** The calendar's "today" (see `Calendar`). Pass it with SSR and in tests. */
  today?: IsoDate | undefined;
  /**
   * BCP 47 locale: the order and separator of the typed text (from `Intl.DateTimeFormat`), the
   * placeholder, the date in the button's name and the calendar. Default: the runtime's.
   */
  locale?: string | undefined;
  /** First day of the week of the calendar. Default: from `locale`. */
  weekStartsOn?: Weekday | undefined;
  /** Texts, merged with the English defaults. */
  labels?: Partial<DatePickerLabels> | undefined;
  /** Height of the input and of the button. Default `md`. */
  size?: DatePickerSize | undefined;
}

// Full literals (Tailwind scan). Logical properties only (spec §1.13.4).
// The row stretches in a Field column like an Input; the input takes the free width. The gap keeps
// the two focus rings (2px + 2px offset) apart.
const ROW = 'flex min-w-0 max-w-full items-center gap-2';
const INPUT = 'min-w-0 flex-1';
// The popover holds the Calendar (which draws its own surface and frame): a drop effect and the room
// the viewport leaves, scrolling inside when there is not enough. Enter fade only under `motion-safe:`;
// the content unmounts on close at once (no exit animation, so the focus returns on the next frame).
const CONTENT =
  'max-w-(--radix-popover-content-available-width) max-h-(--radix-popover-content-available-height) overflow-auto ' +
  'rounded-rop-md [box-shadow:0_4px_16px_rgb(0_0_0/0.2)] motion-safe:data-[state=open]:animate-rop-overlay-in';
const COLLISION_PADDING = 8;

// Decorative calendar glyph (the button is named by aria-label).
const CALENDAR_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

const PREFIX = '[formrail] <DatePicker>';
const invalidDate = (v: unknown) => v !== undefined && v !== null && !isIsoDate(v);

function longDateFormatter(locale: string | undefined): (date: IsoDate) => string {
  const format = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  return (date) => format.format(toUtcDate(date));
}

/**
 * DatePicker: a text input in the locale's numeric format plus a button that opens a `Calendar` in
 * a popover. The value is a calendar date `YYYY-MM-DD`, like the Calendar's.
 *
 * - Typing: the order and separator come from the locale (`en-US` `MM/DD/YYYY`, `it-IT`
 *   `DD/MM/YYYY`), shown as the placeholder. The text is committed when the focus leaves the input and on Enter: a valid date
 *   is reformatted; an ISO date (`2026-03-15`, e.g. pasted) is accepted in every locale; see
 *   `onValueChange`/`onInvalidInput` for the empty and invalid cases.
 * - Popover: the button or Alt+ArrowDown in the input open it, with the focus on the selected date
 *   (else today, else the first selectable day). Picking a date (also the one already selected)
 *   closes it; Escape and a click outside close it without changes. The focus then returns to the
 *   element that opened it (the button, or the input for Alt+ArrowDown), unless the user has
 *   already put it on another element. It is a `role="dialog"` on the `popover` level, above a
 *   Dialog or Sheet, whose Escape closes only the popover.
 * - Inside a `Field`: the input takes `id`, `aria-describedby`, `aria-invalid`, `aria-required`,
 *   `disabled`, `readOnly`, `name`, `data-rop-name` (as `Input`). `disabled`: input and button out of
 *   the tab order. `forced`/`locked` (or `readOnly`): the input is read-only, the button stays
 *   focusable but never opens the calendar (click, Enter, Space; Alt+ArrowDown in the input), and
 *   carries the Field's description (the reason); an open popover closes. The button is named by its
 *   text followed by the Field's label, so two DatePickers on a page have distinct names.
 * - The calendar inside the popover is not wired to the Field (no duplicated id).
 * - `className` goes to the input; `ref` is the input.
 */
export const DatePicker = /* @__PURE__ */ forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(props, ref) {
  const {
    value: valueProp,
    defaultValue,
    onValueChange,
    onInvalidInput,
    min: minProp,
    max: maxProp,
    isDateDisabled,
    today,
    locale: localeProp,
    weekStartsOn,
    labels,
    size = 'md',
    className,
    placeholder,
    disabled: ownDisabled,
    readOnly: ownReadOnly,
    onBlur,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    autoComplete,
    ...rest
  } = props;
  const controlled = 'value' in props;

  const control = useContext(FieldContext);
  const fieldProps = useFieldControlProps({ disabled: ownDisabled, readOnly: ownReadOnly });
  const disabled = fieldProps.disabled === true;
  const blocked = !disabled && (fieldProps.readOnly === true || control?.interactionBlocked === true);
  const locked = disabled || blocked;

  const text: DatePickerLabels = {
    chooseDate: labels?.chooseDate ?? DEFAULT_LABELS.chooseDate,
    chooseDateSelected: labels?.chooseDateSelected ?? DEFAULT_LABELS.chooseDateSelected,
    previousMonth: labels?.previousMonth ?? DEFAULT_LABELS.previousMonth,
    nextMonth: labels?.nextMonth ?? DEFAULT_LABELS.nextMonth,
  };

  // --- inputs -----------------------------------------------------------------------------------
  const min = isIsoDate(minProp) ? minProp : undefined;
  const max = isIsoDate(maxProp) ? maxProp : undefined;
  const locale = resolveLocale(localeProp);
  const format = useMemo(() => getDateTextFormat(locale), [locale]);
  const longDate = useMemo(() => longDateFormatter(locale), [locale]);

  const [inner, setInner] = useState<IsoDate | null>(() => (isIsoDate(defaultValue) ? defaultValue : null));
  const selected: IsoDate | null = controlled ? (isIsoDate(valueProp) ? valueProp : null) : inner;
  const toText = (date: IsoDate | null) => (date ? formatDateText(date, format) : '');

  useEffect(() => {
    if (!isDev()) return;
    if (controlled && invalidDate(valueProp)) {
      console.error(`${PREFIX} \`value\` ${JSON.stringify(valueProp)} is not a valid ISO date (YYYY-MM-DD): the field is empty.`);
    }
  }, [controlled, valueProp]);
  useEffect(() => {
    if (!isDev()) return;
    for (const [name, v] of [
      ['defaultValue', defaultValue],
      ['min', minProp],
      ['max', maxProp],
    ] as const) {
      if (invalidDate(v)) console.error(`${PREFIX} \`${name}\` ${JSON.stringify(v)} is not a valid ISO date (YYYY-MM-DD): it is ignored.`);
    }
  }, [defaultValue, minProp, maxProp]);

  // --- text -------------------------------------------------------------------------------------
  // The text follows the value and the format: whenever either changes (from outside, or from a
  // commit the parent did not accept) it is rewritten, during render (no frame with the old text)
  // and without any callback. A commit records the value it emitted, so the parent applying it
  // does not rewrite the text the user is looking at (an invalid text emitting `null`).
  const [textValue, setTextValue] = useState(() => toText(selected));
  const [edited, setEdited] = useState(false);
  const syncKey = `${selected ?? ''}|${format.pattern}`;
  const [synced, setSynced] = useState(syncKey);
  if (synced !== syncKey) {
    setSynced(syncKey);
    setTextValue(toText(selected));
    setEdited(false);
  }
  // A Field that becomes disabled/forced/locked while the user is typing: the uncommitted text is
  // dropped (it could never be committed), the value is shown.
  if (locked && edited) {
    setEdited(false);
    setTextValue(toText(selected));
  }

  const emit = (next: IsoDate | null) => {
    setSynced(`${next ?? ''}|${format.pattern}`);
    if (next === selected) return;
    if (!controlled) setInner(next);
    onValueChange?.(next);
  };

  const commit = () => {
    if (!edited || locked) return;
    setEdited(false);
    const typed = textValue;
    const parsed = parseDateText(typed, format);
    if (parsed.kind === 'empty') {
      setTextValue('');
      emit(null);
      return;
    }
    let reason: DatePickerInvalidReason | null = null;
    if (parsed.kind === 'invalid') reason = 'unparsable';
    else if (limitsConflict({ min, max }) || (min !== undefined && parsed.date < min) || (max !== undefined && parsed.date > max)) {
      reason = 'out-of-range';
    } else if (isDateDisabled?.(parsed.date)) reason = 'disabled-date';
    if (parsed.kind === 'invalid' || reason) {
      emit(null);
      onInvalidInput?.(typed, reason ?? 'unparsable');
      return;
    }
    setTextValue(formatDateText(parsed.date, format));
    emit(parsed.date);
  };

  // --- popover ----------------------------------------------------------------------------------
  const composing = useRef(false);
  const [open, setOpen] = useState(false);
  // Never open while it cannot be used: closes at once when the Field becomes disabled/locked.
  if (open && locked) setOpen(false);
  const buttonRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useReturnFocus({
    open,
    fallbackRef: buttonRef,
    // A click outside on another focusable element (another field): the focus stays there.
    skipWhen: () => {
      const active = document.activeElement;
      return !!active && active !== document.body && !contentRef.current?.contains(active);
    },
  });

  const pick = (date: IsoDate) => {
    setEdited(false);
    setTextValue(formatDateText(date, format));
    emit(date);
    setOpen(false);
  };
  // `Calendar` reports only a change: picking the date already selected closes the popover too.
  const reselected = (target: EventTarget | null) => {
    const cell = (target as HTMLElement | null)?.closest?.('[role="gridcell"]');
    return !!cell && cell.getAttribute('aria-selected') === 'true' && cell.getAttribute('aria-disabled') !== 'true';
  };

  // --- rendering --------------------------------------------------------------------------------
  const buttonId = `${useId()}-button`;
  const buttonName = selected ? text.chooseDateSelected(longDate(selected)) : text.chooseDate;
  const fieldLabel = control?.['aria-labelledby'];

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
    >
      <Popover.Anchor asChild>
        <div className={ROW}>
          <Input
            {...rest}
            ref={ref}
            type="text"
            size={size}
            autoComplete={autoComplete ?? 'off'}
            placeholder={placeholder ?? format.pattern}
            disabled={ownDisabled}
            readOnly={ownReadOnly}
            value={textValue}
            className={cn(INPUT, className)}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              if (locked) return;
              setTextValue(event.target.value);
              setEdited(true);
            }}
            onCompositionStart={(event: CompositionEvent<HTMLInputElement>) => {
              composing.current = true;
              onCompositionStart?.(event);
            }}
            onCompositionEnd={(event: CompositionEvent<HTMLInputElement>) => {
              composing.current = false;
              onCompositionEnd?.(event);
            }}
            // Committed first: the consumer's onBlur already sees the committed value (validation on blur).
            onBlur={(event: FocusEvent<HTMLInputElement>) => {
              composing.current = false;
              commit();
              onBlur?.(event);
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              onKeyDown?.(event);
              // IME (spec §1.13.5): keys belong to the composition; keyCode 229 covers the keydown
              // some engines (Safari) fire right after `compositionend`.
              if (event.defaultPrevented || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === 'Enter') commit();
              else if (event.key === 'ArrowDown' && event.altKey) {
                event.preventDefault();
                if (locked) return;
                commit();
                setOpen(true);
              }
            }}
          />
          <Button
            ref={buttonRef}
            id={buttonId}
            type="button"
            variant="secondary"
            size={size === 'sm' ? 'icon-sm' : 'icon-md'}
            aria-label={buttonName}
            aria-labelledby={fieldLabel ? `${buttonId} ${fieldLabel}` : undefined}
            // The reason why nothing opens is read on the button too.
            aria-describedby={blocked ? control?.['aria-describedby'] : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={disabled}
            onClick={(event: MouseEvent<HTMLElement>) => {
              if (locked) {
                event.preventDefault();
                return;
              }
              setOpen((current) => !current);
            }}
          >
            <Icon size={size === 'sm' ? 'sm' : 'md'}>{CALENDAR_ICON}</Icon>
          </Button>
        </div>
      </Popover.Anchor>
      {open ? (
        <Popover.Portal>
          <Popover.Content
            ref={contentRef}
            aria-label={text.chooseDate}
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={COLLISION_PADDING}
            // The focus goes to the calendar's tab stop; it is returned by `useReturnFocus`.
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              contentRef.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus();
            }}
            onCloseAutoFocus={(event) => event.preventDefault()}
            // A press on the button while open is its own toggle, not a click outside.
            onInteractOutside={(event) => {
              if (buttonRef.current?.contains(event.target as Node)) event.preventDefault();
            }}
            className={cn(CONTENT, overlayLayer.popover)}
          >
            {/* The calendar is a plain control here: not the Field's (its id is the input's). */}
            <FieldContext.Provider value={null}>
              <Calendar
                value={selected}
                onValueChange={pick}
                min={min}
                max={max}
                isDateDisabled={isDateDisabled}
                today={today}
                locale={locale}
                weekStartsOn={weekStartsOn}
                labels={{ previousMonth: text.previousMonth, nextMonth: text.nextMonth }}
                onClick={(event) => {
                  if (reselected(event.target)) setOpen(false);
                }}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && reselected(event.target)) setOpen(false);
                }}
              />
            </FieldContext.Provider>
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
});
