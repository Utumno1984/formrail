import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '../icon/Icon';
import { internalIcons } from '../internal/icons';
import { ModalRoot } from '../internal/modal';
import { handleNavigationClick, hasNavigableHref } from '../internal/navigation';
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuTrigger } from '../menu/Menu';
import { SheetBody, SheetClose, SheetContent, SheetHeader, SheetTitle } from '../sheet/Sheet';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import { APP_SHELL_WIDE_QUERY } from './breakpoint';
import type { AppDescriptor } from './types';

export interface AppSwitcherLabels {
  /**
   * Accessible name of the trigger when the current app is known, from its `label`. Keep the label in it: the
   * trigger shows the label, and its name must contain its visible text. Default `Switch app, current: <label>`.
   */
  trigger: (currentAppLabel: string) => string;
  /**
   * Visible text and accessible name of the trigger when `currentAppId` is missing or matches no app.
   * Default `Switch app`.
   */
  noCurrent: string;
  /** Title of the Sheet (its accessible name) on a narrow viewport. Default `Switch app`. */
  sheetTitle: string;
  /**
   * Shown in the Menu (as its only item, disabled) or the Sheet when there is no app other than the current one.
   * Default `No other apps available`.
   */
  empty: string;
}

/** @internal Not public API: exported only for the test of the documented defaults (label-defaults.test.tsx, #549). */
export const DEFAULT_LABELS: AppSwitcherLabels = {
  trigger: (label) => `Switch app, current: ${label}`,
  noCurrent: 'Switch app',
  sheetTitle: 'Switch app',
  empty: 'No other apps available',
};

/** How the list of apps opens: a Menu under the trigger, a Sheet from the edge, or chosen at each opening. */
export type AppSwitcherPresentation = 'auto' | 'menu' | 'sheet';

export interface AppSwitcherProps {
  /**
   * The apps, in the order the user sees them, already filtered by the consumer (the same list as `AppLauncher`).
   * Apps with a duplicate `id` or an empty `label` are an error in development.
   */
  apps: readonly AppDescriptor[];
  /**
   * `id` of the app the user is in: the trigger shows its label (and its icon), and in the list it has
   * `aria-current="true"` and a check mark. Choosing it closes the list and does nothing else (no `onNavigate`, no
   * browser navigation). Missing, or matching no app: the trigger shows `labels.noCurrent`.
   */
  currentAppId?: string;
  /**
   * Opens an app with your router. Called once for a plain primary click or Enter on an enabled app other than the
   * current one, AFTER the list has closed and the focus is back on the trigger, so a dirty guard opened from here
   * (`useDirtyGuard().guard`) returns the focus to the trigger. The browser's own navigation to the `href` is
   * cancelled first. On an app with an `href`, never called for Ctrl/Cmd/Shift/Alt+click or the middle button:
   * those are left to the browser (a new tab or window on the real `href`), and the list closes. If it throws, the
   * list is already closed and the error propagates. Without `onNavigate` an app with an `href` is a plain link.
   * A focus you move from here (to the heading of the new page) stays there in both forms: the Sheet, which returns
   * the focus after its exit animation, leaves it where it is.
   */
  onNavigate?: (app: AppDescriptor, event: MouseEvent<HTMLElement>) => void;
  /**
   * `menu`: a Menu under the trigger. `sheet`: a Sheet from the start edge, with a title, as tall as the visible
   * viewport. `auto`: chosen when the list opens, from the width of the viewport (a Menu from 64rem, the breakpoint
   * of the app shell, a Sheet below it); a list that is open keeps its form until it closes, even if the viewport
   * crosses the breakpoint. While the list is closed the markup is the same in every form, so `auto` renders the
   * same on the server and on the client. The price of it: with `auto` and the list closed the trigger says
   * `aria-haspopup="menu"` on every viewport, also on a narrow one where it opens a dialog (it says `dialog` while
   * the Sheet is open, and always with `sheet`).
   * @default 'auto'
   */
  presentation?: AppSwitcherPresentation;
  /** Texts for localization; every key falls back to the English default. */
  labels?: Partial<AppSwitcherLabels>;
  /** Classes of the trigger, merged with its own (a conflicting class wins). */
  className?: string;
}

/** @internal Not public API: the form a list opens in (exported for the unit test). */
export function resolveAppSwitcherForm(presentation: AppSwitcherPresentation, isWide: () => boolean): 'menu' | 'sheet' {
  if (presentation !== 'auto') return presentation;
  return isWide() ? 'menu' : 'sheet';
}

/** Whether the viewport is at or above the breakpoint. Without `matchMedia` (server, jsdom): wide, a Menu. */
function viewportIsWide(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return window.matchMedia(APP_SHELL_WIDE_QUERY).matches;
  } catch {
    return true;
  }
}

/**
 * @internal Not public API (exported for the unit test). When the item that had the focus left the list: the key
 * of the item to focus instead, the next one in the previous order that is still a candidate, else the previous
 * one, else `null`.
 */
export function survivingFocusKey(
  before: readonly string[],
  lost: string,
  isCandidate: (key: string) => boolean,
): string | null {
  const index = before.indexOf(lost);
  if (index < 0) return null;
  const after = before.slice(index + 1).find(isCandidate);
  if (after !== undefined) return after;
  return [...before.slice(0, index)].reverse().find(isCandidate) ?? null;
}

/** @internal Not public API: the development errors of a list, one message per problem (exported for the unit test). */
export function appSwitcherProblems(apps: readonly AppDescriptor[], hasOnNavigate: boolean): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const app of apps) {
    if (seen.has(app.id)) problems.push(`two apps have the id ${JSON.stringify(app.id)}: ids must be unique`);
    seen.add(app.id);
    if (typeof app.label !== 'string' || app.label.trim() === '') {
      problems.push(`the app ${JSON.stringify(app.id)} has an empty label: its item has no accessible name`);
    }
    if (!app.disabled && !hasNavigableHref(app.href) && !hasOnNavigate) {
      problems.push(`the app ${JSON.stringify(app.id)} has no href and there is no onNavigate: its item opens nothing`);
    }
  }
  return problems;
}

/** Key of each app: its `id`, made unique for a duplicate (already reported in development) so React keeps working. */
function keysOf(apps: readonly AppDescriptor[]): string[] {
  const seen = new Map<string, number>();
  return apps.map((app) => {
    const n = seen.get(app.id) ?? 0;
    seen.set(app.id, n + 1);
    return n === 0 ? app.id : `${app.id}\u0000${n}`;
  });
}

// Full literals (Tailwind scan). The trigger: one line, the current app's icon and label and a chevron, cut with an
// ellipsis when the header is short of room (never wider than its container). Content-box like every box of the
// library. Feedback motion through the feedback tokens, off under prefers-reduced-motion.
const TRIGGER =
  'inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-rop-md border border-solid border-transparent ' +
  'bg-transparent px-2 py-1.5 font-rop-sans text-rop-body font-semibold text-rop-text ' +
  'rop-hover:bg-rop-surface-subtle active:bg-rop-surface-pressed data-[state=open]:bg-rop-surface-subtle ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2 ' +
  'motion-safe:[transition-property:background-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)]';
const TRIGGER_ICON = 'flex size-5 shrink-0 items-center justify-center text-rop-primary [&>svg]:size-5';
const TRIGGER_LABEL = 'min-w-0 truncate';

// An app in the Menu: icon, label, the reason of a disabled app under it, and the check mark of the current app.
const MENU_ITEM = 'gap-2 data-[current]:font-semibold';
const ITEM_ICON = 'flex size-5 shrink-0 items-center justify-center text-rop-primary [&>svg]:size-5';
const ITEM_TEXT = 'flex min-w-0 flex-1 flex-col';
const ITEM_REASON = 'text-rop-caption italic';
const ITEM_CHECK = 'shrink-0 text-rop-primary';

// An app in the Sheet: a full-width row with the same parts; the current app also has a bar on the start edge (a
// shape, not only a colour; a system colour under forced colours). Content-box (the library ships no box-sizing
// reset): no width, the row stretches in its flex-column `li` with the padding inside; the minimum height is 1.75rem
// of content plus 0.5rem of padding on each side, a 44px touch target.
const SHEET_LIST = 'm-0 flex list-none flex-col gap-0.5 p-0';
const SHEET_ITEM =
  'relative flex min-h-7 min-w-0 items-center gap-2 rounded-rop-md border-0 bg-transparent px-3 py-2 ' +
  'text-start font-rop-sans text-rop-body text-rop-text no-underline ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:[outline-offset:-2px]';
const SHEET_ITEM_ENABLED =
  'cursor-pointer rop-hover:bg-rop-surface-subtle active:bg-rop-surface-pressed ' +
  'motion-safe:[transition-property:background-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)]';
const SHEET_ITEM_DISABLED = 'cursor-not-allowed text-rop-text-muted';
const SHEET_ITEM_CURRENT =
  'bg-rop-primary-subtle font-semibold ' +
  "before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-e-full before:bg-rop-primary before:content-[''] " +
  'forced-colors:before:bg-[Highlight]';
const EMPTY = 'm-0 px-3 py-2 text-rop-text-muted';
// The same muted text in the Menu, on a disabled item that is not dimmed further (it is a message, not an app).
const EMPTY_ITEM = 'cursor-default text-rop-text-muted data-[disabled]:cursor-default data-[disabled]:opacity-100';

type Form = 'menu' | 'sheet';

/**
 * The switch from one app to another of the same product, in the header of an app: a trigger that shows the
 * current app and opens the list of apps (the same `AppDescriptor` list as `AppLauncher`). On a wide viewport the
 * list is a Menu (every app a menu item, a real link when it has an `href`); on a narrow one, a Sheet with a list
 * of links (`presentation`). Arrows and typeahead skip a disabled app in the Menu; in the Sheet it keeps its focus
 * stop. Its reason is its description (`aria-describedby`) in both.
 *
 * Choosing an app closes the list and gives the focus back to the trigger before `onNavigate` is called; choosing
 * the current app only closes it. The Menu sits on the `popover` level and the Sheet on the `modal` level, so the
 * switcher works inside an open `Dialog` or `Sheet`.
 *
 * Declared behaviour:
 * - When there is no app other than the current one (or `apps` is empty) the trigger is still there and the list
 *   shows `labels.empty` instead of the apps: in the Menu as its only item, disabled (a menu must contain an item),
 *   which is also the Menu's description, read when it opens; in the Sheet as a paragraph.
 * - If the app that has the focus leaves `apps` while the list is open, the focus moves to the next app that can
 *   take it (the previous one at the end); the list stays open. If it stays in `apps` but becomes disabled, the
 *   focus stays on it: the item is still there, now disabled (it opens nothing, its reason is its description).
 * - The Sheet opens on the click of the trigger (its activation, as any dialog trigger), the Menu on the press: a
 *   press that ends in no click (dragged off the trigger, a touch that turns into a scroll) opens no Sheet. A
 *   Ctrl+press (the secondary click of macOS) opens neither form.
 * - Unmounting the switcher with the list open closes it without errors.
 * - The same limits as `MenuLinkItem` apply to the Menu (Ctrl/Cmd/Shift+Enter navigates like Enter; an exit
 *   animation on the Menu would delay the focus).
 */
export const AppSwitcher = /* @__PURE__ */ forwardRef<HTMLButtonElement, AppSwitcherProps>(function AppSwitcher(
  { apps, currentAppId, onNavigate, presentation = 'auto', labels: labelsProp, className },
  ref,
) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const baseId = useId();
  const sheetId = `${baseId}-sheet`;
  const emptyId = `${baseId}-empty`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const composedRef = useMemo(() => composeRefs<HTMLButtonElement>(triggerRef, ref), [ref]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(presentation === 'sheet' ? 'sheet' : 'menu');
  const openRef = useRef(open);
  openRef.current = open;

  const keys = useMemo(() => keysOf(apps), [apps]);
  const current = currentAppId === undefined ? undefined : apps.find((app) => app.id === currentAppId);
  const isCurrent = (app: AppDescriptor) => current !== undefined && app.id === current.id;
  const hasOthers = apps.some((app) => !isCurrent(app));

  const problems = process.env.NODE_ENV !== 'production' ? appSwitcherProblems(apps, !!onNavigate).join('\n') : '';
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !problems) return;
    for (const problem of problems.split('\n')) console.error(`[formrail] <AppSwitcher>: ${problem}.`);
  }, [problems]);

  // --- Opening and closing ------------------------------------------------------------------------------------
  // The form is decided here, at the moment the list opens, and kept until it closes.
  const openList = useCallback(() => {
    if (openRef.current) return;
    const next = resolveAppSwitcherForm(presentation, viewportIsWide);
    setForm(next);
    // The Sheet returns the focus to the element that had it when it opened: the trigger (a pointer press does not
    // focus it in every browser).
    if (next === 'sheet' && triggerRef.current && triggerRef.current.ownerDocument.activeElement !== triggerRef.current) {
      triggerRef.current.focus({ preventScroll: true });
    }
    setOpen(true);
  }, [presentation]);
  const closeList = useCallback(() => setOpen(false), []);

  // A pointer press that will open a Sheet is taken from the Menu's trigger (Radix opens on the press): the Sheet
  // opens on the click, the activation of a button, so a press that ends in no click opens nothing (dragged off
  // the trigger, or a touch on the trigger that becomes a scroll of the page). The flag ties the click to its own
  // press: a click no press began opens nothing, as in the Menu (Radix's trigger has no click handler); the Ctrl
  // check is Radix's (the secondary click of macOS opens neither form).
  const sheetPress = useRef(false);
  const onTriggerPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    sheetPress.current = false;
    if (openRef.current || event.button !== 0 || event.ctrlKey) return;
    if (resolveAppSwitcherForm(presentation, viewportIsWide) !== 'sheet') return;
    event.preventDefault();
    sheetPress.current = true;
  };
  const onTriggerClick = () => {
    if (!sheetPress.current) return;
    sheetPress.current = false;
    openList();
  };

  /**
   * Closes the list, gives the focus to the trigger, then runs `then` (which may throw: the list is closed). A focus
   * `then` moves elsewhere stays there: the Menu does not return it when it is already outside, and the Sheet
   * neither (`keepFocusWhen` below).
   */
  const closeThen = (then: () => void) => {
    flushSync(() => setOpen(false));
    triggerRef.current?.focus();
    then();
  };

  // After its exit animation the Sheet returns the focus to the trigger. When something already has it (the trigger,
  // given it by `closeThen`, or the heading the page opened by `onNavigate` moved it to) it is left there, the same
  // rule as the Menu's. Without it a Sheet would take the focus back from the new page.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const focusIsElsewhere = () => {
    const doc = triggerRef.current?.ownerDocument ?? document;
    const active = doc.activeElement;
    return !!active && active !== doc.body && !sheetRef.current?.contains(active);
  };

  // --- The focus survives a change of the list ------------------------------------------------------------------
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sheetListRef = useRef<HTMLUListElement | null>(null);
  const focused = useRef<{ key: string; element: HTMLElement } | null>(null);
  const previousKeys = useRef<readonly string[]>(keys);
  const onItemFocus = (key: string) => (event: FocusEvent<HTMLElement>) => {
    focused.current = { key, element: event.currentTarget };
  };
  useLayoutEffect(() => {
    const before = previousKeys.current;
    previousKeys.current = keys;
    const last = focused.current;
    if (!last || last.element.isConnected) return;
    focused.current = null;
    const doc = last.element.ownerDocument;
    const active = doc.activeElement;
    // The focus already went somewhere real: leave it there.
    if (active && active !== doc.body && active.isConnected) return;
    const container = form === 'menu' ? menuRef.current : sheetListRef.current;
    if (!container) return;
    const items = new Map<string, HTMLElement>();
    for (const element of container.querySelectorAll<HTMLElement>('[data-rop-app-key]')) {
      // In the Menu a disabled item cannot be highlighted: it is not a candidate.
      if (form === 'menu' && element.hasAttribute('data-disabled')) continue;
      items.set(element.dataset.ropAppKey ?? '', element);
    }
    const key = items.has(last.key) ? last.key : survivingFocusKey(before, last.key, (k) => items.has(k));
    (key === null ? null : items.get(key))?.focus();
  });

  // --- Rendering ------------------------------------------------------------------------------------------------
  const triggerText = current ? current.label : labels.noCurrent;
  const triggerName = current ? labels.trigger(current.label) : labels.noCurrent;
  const shownForm: Form = open ? form : presentation === 'sheet' ? 'sheet' : 'menu';
  const hasIcon = (app: AppDescriptor) => app.icon !== undefined && app.icon !== null;
  const reasonOf = (app: AppDescriptor) => (app.disabled && app.disabledReason ? app.disabledReason : undefined);

  // Every activation of an enabled app with the rule of `internal/navigation`: the current app only closes the
  // list; another app goes to `onNavigate` after the list has closed.
  const navigateTo = (app: AppDescriptor) =>
    isCurrent(app)
      ? () => undefined
      : onNavigate && ((event: MouseEvent<HTMLElement>) => onNavigate(app, event));

  const itemBody = (app: AppDescriptor, reasonId: string | undefined) => (
    <>
      {hasIcon(app) ? (
        <span aria-hidden="true" className={cn(ITEM_ICON, app.disabled && 'opacity-60')}>
          {app.icon}
        </span>
      ) : null}
      <span className={ITEM_TEXT}>
        <span className="truncate">{app.label}</span>
        {/* Read as the item's description, not as part of its name. */}
        {reasonId ? (
          <span id={reasonId} aria-hidden="true" data-rop-app-disabled-reason="" className={ITEM_REASON}>
            {reasonOf(app)}
          </span>
        ) : null}
      </span>
      {isCurrent(app) ? (
        <Icon className={ITEM_CHECK} size="sm">
          {internalIcons.check}
        </Icon>
      ) : null}
    </>
  );

  const menuItems = apps.map((app, i) => {
    const key = keys[i]!;
    const reason = reasonOf(app);
    const reasonId = reason ? `${baseId}-reason-${i}` : undefined;
    const common = {
      'aria-current': isCurrent(app) ? ('true' as const) : undefined,
      'aria-describedby': reasonId,
      'data-current': isCurrent(app) ? '' : undefined,
      'data-rop-app-id': app.id,
      'data-rop-app-key': key,
      disabled: !!app.disabled,
      textValue: app.label,
      onFocus: onItemFocus(key),
      className: MENU_ITEM,
    };
    const navigate = navigateTo(app);
    if (hasNavigableHref(app.href)) {
      return (
        <MenuLinkItem key={key} {...common} href={app.href} onNavigate={navigate}>
          {itemBody(app, reasonId)}
        </MenuLinkItem>
      );
    }
    // No `href`: nothing for the browser to open, every click is the app's (modifiers included).
    return (
      <MenuItem
        key={key}
        {...common}
        onClick={(event) => {
          if (app.disabled || !navigate) return;
          event.preventDefault();
          closeThen(() => navigate(event));
        }}
      >
        {itemBody(app, reasonId)}
      </MenuItem>
    );
  });

  const sheetItems = apps.map((app, i) => {
    const key = keys[i]!;
    const disabled = !!app.disabled;
    const reason = reasonOf(app);
    const reasonId = reason ? `${baseId}-sheet-reason-${i}` : undefined;
    const navigate = navigateTo(app);
    const native = hasNavigableHref(app.href);
    const common = {
      'aria-current': isCurrent(app) ? ('true' as const) : undefined,
      'aria-describedby': reasonId,
      'aria-disabled': disabled ? ('true' as const) : undefined,
      'data-rop-app-id': app.id,
      'data-rop-app-key': key,
      onFocus: onItemFocus(key),
      onClick: (event: MouseEvent<HTMLElement>) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        const handled = handleNavigationClick(event, navigate && ((e) => closeThen(() => navigate(e))), { native });
        // Left to the browser (a new tab, or a plain link without `onNavigate`): the list closes as in the Menu.
        if (!handled) closeList();
      },
      onAuxClick: (event: MouseEvent<HTMLElement>) => {
        if (event.defaultPrevented || disabled || event.button !== 1 || !native) return;
        closeList();
      },
      className: cn(SHEET_ITEM, disabled ? SHEET_ITEM_DISABLED : SHEET_ITEM_ENABLED, isCurrent(app) && SHEET_ITEM_CURRENT),
    };
    return (
      <li key={key} className="flex min-w-0 flex-col">
        {native ? (
          // A disabled app keeps its `<a>` and its focus stop (the reason can be read) but loses its `href`.
          <a {...common} href={disabled ? undefined : app.href} role={disabled ? 'link' : undefined} tabIndex={disabled ? 0 : undefined}>
            {itemBody(app, reasonId)}
          </a>
        ) : (
          <button {...common} type="button">
            {itemBody(app, reasonId)}
          </button>
        )}
      </li>
    );
  });

  // Where the Sheet's focus starts: the current app, else the first app that can be opened, else the default.
  const onSheetOpenAutoFocus = (event: Event) => {
    const list = sheetListRef.current;
    if (!list) return;
    const all = [...list.querySelectorAll<HTMLElement>('[data-rop-app-key]')];
    const target =
      all.find((el) => el.getAttribute('aria-current') === 'true') ?? all.find((el) => !el.hasAttribute('aria-disabled'));
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  // Only the keys that differ between the forms: an `undefined` value would override the Menu trigger's own.
  const formAttributes: Record<string, string> =
    shownForm === 'sheet'
      ? { 'aria-haspopup': 'dialog', ...(open ? { 'aria-controls': sheetId, 'data-state': 'open' } : {}) }
      : {};

  return (
    <>
      <Menu open={open && form === 'menu'} onOpenChange={(next) => (next ? openList() : closeList())}>
        <MenuTrigger
          ref={composedRef}
          {...formAttributes}
          aria-label={triggerName}
          aria-expanded={open}
          data-rop-app-switcher=""
          onPointerDown={onTriggerPointerDown}
          onClick={onTriggerClick}
          className={cn(TRIGGER, className)}
        >
          {current && hasIcon(current) ? (
            <span aria-hidden="true" className={TRIGGER_ICON}>
              {current.icon}
            </span>
          ) : null}
          <span className={TRIGGER_LABEL}>{triggerText}</span>
          <Icon size="sm" className="shrink-0">
            {internalIcons['chevron-down']}
          </Icon>
        </MenuTrigger>
        <MenuContent
          ref={menuRef}
          align="start"
          aria-describedby={hasOthers ? undefined : emptyId}
          data-rop-app-switcher-menu=""
        >
          {hasOthers ? (
            menuItems
          ) : (
            // A menu without an item is invalid (axe `aria-required-children`): the text is a disabled item, read as
            // an unavailable item in browse mode, and the Menu's description (the focus stays on the Menu).
            <MenuItem id={emptyId} disabled className={EMPTY_ITEM}>
              {labels.empty}
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
      <ModalRoot
        open={open && form === 'sheet'}
        onOpenChange={(next) => (next ? openList() : closeList())}
        keepFocusWhen={focusIsElsewhere}
      >
        <SheetContent
          ref={sheetRef}
          id={sheetId}
          side="left"
          size="sm"
          returnFocusRef={triggerRef}
          onOpenAutoFocus={onSheetOpenAutoFocus}
          data-rop-app-switcher-sheet=""
        >
          <SheetHeader>
            <SheetTitle>{labels.sheetTitle}</SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody>
            {hasOthers ? (
              <ul ref={sheetListRef} className={SHEET_LIST}>
                {sheetItems}
              </ul>
            ) : (
              <p className={EMPTY}>{labels.empty}</p>
            )}
          </SheetBody>
        </SheetContent>
      </ModalRoot>
    </>
  );
});
