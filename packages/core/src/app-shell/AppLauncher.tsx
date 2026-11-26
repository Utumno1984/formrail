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
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { handleNavigationClick, hasNavigableHref, isAppNavigationClick } from '../internal/navigation';
import { Skeleton } from '../skeleton/Skeleton';
import { StatusBadge } from '../status-badge/StatusBadge';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import type { AppDescriptor, AppLauncherExtraGroup, AppLauncherExtraItem } from './types';

export interface AppLauncherLabels {
  /** Accessible name of the region (`<nav>`). Default `Apps`. */
  region: string;
  /** Text shown when the list is empty and nothing is loading. Default `No apps available`. */
  empty: string;
  /**
   * Announced by assistive technology when the apps start loading. It lives in a polite status region inside the
   * navigation region (outside the `aria-busy` placeholders, which may hold back the announcement), always mounted
   * empty and filled after the mount, so that a launcher mounted already loading is announced too. Emptied once
   * loaded. A hidden launcher (`hidden`, `display: none`) announces nothing.
   * Default `Loading apps`.
   */
  loading: string;
  /**
   * Accessible name of the list of the apps, used only when `extraGroups` shows at least one group: the region then
   * holds several lists, and each one is named (the apps have no visible heading, so their grid does not move).
   * Without extra groups the list of the apps has no name of its own. Default `Apps`.
   */
  appsGroup: string;
}

/** @internal Not public API: exported only for the test of the documented defaults (label-defaults.test.tsx, #549). */
export const DEFAULT_LABELS: AppLauncherLabels = {
  region: 'Apps',
  empty: 'No apps available',
  loading: 'Loading apps',
  appsGroup: 'Apps',
};

/** Placeholders shown while loading when there is no list yet and no `loadingCount`. */
const DEFAULT_LOADING_COUNT = 4;

/**
 * The element a tile is rendered as, for an app and for an item of `extraGroups` alike: a link with an `href`, a
 * button without one.
 */
export type AppLauncherTileElement = HTMLAnchorElement | HTMLButtonElement;

export interface AppLauncherProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /**
   * The apps, in the order the user sees and tabs through them, already filtered by the consumer (roles,
   * permissions: the library knows nothing about them). Apps with a duplicate `id` or an empty `label` are an
   * error in development.
   */
  apps: readonly AppDescriptor[];
  /**
   * Opens an app with your router. Called once, synchronously, for a plain primary click or Enter on an enabled
   * tile; the browser's own navigation to the `href` is cancelled first. On a tile with an `href`, never called for
   * Ctrl/Cmd/Shift/Alt+click or the middle button: those are left to the browser (a new tab or window on the real
   * `href`). On a tile without an `href` (a button) there is nothing for the browser to open, so a click is always
   * handed to `onNavigate`, modifiers included. The tile has the focus when it is called, so a dirty guard opened
   * from here (`useDirtyGuard().guard`) returns the focus to it. Without `onNavigate` a tile with an `href` is a
   * plain link.
   */
  onNavigate?: (app: AppDescriptor, event: MouseEvent<AppLauncherTileElement>) => void;
  /** `id` of the app the user is in: its tile gets `aria-current="true"` and a visible marker, and can still be opened. */
  currentAppId?: string;
  /**
   * Shows placeholder tiles (same size and columns as the real ones) instead of the list, and marks them
   * `aria-busy`.
   * @default false
   */
  loading?: boolean;
  /**
   * Number of placeholder tiles while `loading`: pass the number of apps you expect, so that the region keeps its
   * height when they arrive. Default: the number of `apps` already known, or 4 when there are none. A value that is
   * not a finite integer of at least 0 (`2.5`, `-1`, `NaN`, `Infinity`) is ignored: the default is used. The items
   * of `extraGroups` are not counted: the groups are not shown while loading and appear under the apps with them.
   */
  loadingCount?: number;
  /**
   * Extra groups of entries that can be activated but do not open an app (content of yours, such as a dialog, or a
   * page at an `href`), already filtered by you. Shown after the apps in the same region, each with its visible
   * label over a list named by it, with the same tiles, the same Tab order and the same navigation rule as the apps
   * (`onExtraItemActivate`). A group without entries is not shown; with none to show, the launcher is exactly as
   * without this prop. While `loading` they are not shown either (one loading state for the whole region): they
   * appear together with the apps. With no apps, the empty text takes the place of the apps and the groups follow
   * it. Duplicate ids (of groups, or of entries among themselves and with the apps), empty labels and entries that
   * open nothing are errors in development.
   */
  extraGroups?: readonly AppLauncherExtraGroup[];
  /**
   * Acts on an extra entry, with the same rule as `onNavigate`: called once, synchronously, for a plain primary
   * click or Enter, the browser's own navigation to the `href` cancelled first; on an entry with an `href`, never
   * called for Ctrl/Cmd/Shift/Alt+click or the middle button (left to the browser); on an entry without an `href` (a
   * button) every click is handed to it, modifiers included, and so are Enter and Space. The tile has the focus when
   * it is called, so a dialog opened from here returns the focus to it. Never called for an app, and an extra entry
   * never reaches `onNavigate`. Without it an entry with an `href` is a plain link.
   */
  onExtraItemActivate?: (
    item: AppLauncherExtraItem,
    group: AppLauncherExtraGroup,
    event: MouseEvent<AppLauncherTileElement>,
  ) => void;
  /**
   * Level (2 to 6) of a heading element (`<h2>`…`<h6>`) around the label of each extra group, so that the groups can
   * be reached by heading navigation: pass the level that fits the heading structure of your page. The label keeps
   * its look and still names its list. Without it, or with another value, the label is plain text that names its
   * list (the launcher does not know the heading structure of the page it is in).
   */
  groupHeadingLevel?: AppLauncherGroupHeadingLevel;
  /** Texts for localization; every key falls back to the English default. */
  labels?: Partial<AppLauncherLabels>;
}

// The tiles: as many columns as the width of the launcher itself allows (a container query, never the window),
// so a launcher in a narrow side panel of a wide page has one column. Every row is as tall as the tallest tile
// (`auto-rows-fr`), so all the tiles keep the same height even if the text of one of them needs more room.
// Full literals (Tailwind scan).
const GRID =
  'm-0 grid list-none auto-rows-fr grid-cols-1 gap-3 p-0 @min-[32rem]:grid-cols-2 @min-[48rem]:grid-cols-3 @min-[64rem]:grid-cols-4';

// Every tile is at least this tall, whatever it carries (no icon, no description, a reason): the name takes one
// line, the description and the reason share the two lines under it. A minimum in `lh` (the line height actually
// used, not the token), never a fixed height: with the user's own text spacing (WCAG 1.4.12: line height 1.5 and
// more) the tile grows instead of cutting the text. The placeholder tile and the empty state use the same minimum,
// so the region does not move between loading, empty and loaded.
const TEXT_BLOCK = 'min-h-[3lh]';
// A tile's outer height (padding 0.75rem on each side, 1px border on each side): the minimum of the empty state.
const ROW_MIN_HEIGHT = 'min-h-[calc(3lh+1.5rem+2px)]';

// Content-box like every box of the library: the tile has no width (a block-level flex box in a flex-column `li`
// stretches with its padding inside the cell), so the padding never pushes it out of the grid.
const TILE =
  'relative flex min-w-0 flex-1 items-start gap-3 rounded-rop-md border border-solid border-rop-border bg-rop-surface p-3 ' +
  'text-start font-rop-sans text-rop-body text-rop-text no-underline ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2';

// Hover and pressed feedback only on a tile that can be opened. Motion through the feedback tokens, off under
// prefers-reduced-motion (`motion-safe:`).
const TILE_ENABLED =
  'cursor-pointer rop-hover:border-rop-primary rop-hover:bg-rop-surface-subtle active:border-rop-primary active:bg-rop-blue-50 ' +
  'motion-safe:[transition-property:background-color,border-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)]';

// Disabled: a dashed border (a cue that does not rely on colour) and muted content; the reason is visible text.
const TILE_DISABLED = 'cursor-not-allowed border-dashed bg-rop-surface-subtle text-rop-text-muted';

// Current app: a primary border twice as thick (drawn inside the box, no change of size) and a bar on the inline start
// edge, which is a shape, not only a colour. `forced-colors`: the bar keeps a system colour.
const TILE_CURRENT =
  'border-rop-primary [box-shadow:inset_0_0_0_1px_var(--color-rop-primary)] ' +
  "before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-e-full before:bg-rop-primary before:content-[''] " +
  'forced-colors:before:bg-[Highlight]';

const ICON = 'flex size-10 shrink-0 items-center justify-center text-rop-primary';

// The description and the reason, drawn over the tile under the name line: the tile's border (1px) and padding
// (0.75rem) on each side, after the icon (2.5rem plus the 0.75rem gap) when there is one. Logical insets only.
// Under the name line by `1lh` (same font, so the name's real line height) and no fixed height: the line clamps
// below keep them to the two lines the tile reserves, whatever the line height.
const DETAILS =
  'pointer-events-none absolute end-[calc(0.75rem+1px)] top-[calc(0.75rem+1px+1lh)] ' +
  'flex min-w-0 flex-col font-rop-sans text-rop-body';
const DETAILS_AFTER_ICON = 'start-[calc(4rem+1px)]';
const DETAILS_NO_ICON = 'start-[calc(0.75rem+1px)]';

/**
 * @internal Not public API: the number of placeholder tiles (exported for the unit test). `loadingCount` when it is a
 * finite integer of at least 0, otherwise the number of apps already known, or 4 when there are none.
 */
export function placeholderCount(loadingCount: number | undefined, knownApps: number): number {
  if (typeof loadingCount === 'number' && Number.isInteger(loadingCount) && loadingCount >= 0) return loadingCount;
  return knownApps || DEFAULT_LOADING_COUNT;
}

/**
 * Key of each app: its `id`, made unique for a duplicate (already reported in development) so React keeps working.
 * `prefix` keeps the keys of the extra items apart from those of the apps (an item may share an app's `id`).
 */
function keysOf(entries: readonly { id: string }[], prefix = ''): string[] {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const n = seen.get(entry.id) ?? 0;
    seen.set(entry.id, n + 1);
    return n === 0 ? `${prefix}${entry.id}` : `${prefix}${entry.id}\u0000${n}`;
  });
}

const isEmptyLabel = (label: unknown) => typeof label !== 'string' || label.trim() === '';

/** @internal Not public API: the groups that are shown, those with at least one item (exported for the unit test). */
export function shownExtraGroups(groups: readonly AppLauncherExtraGroup[] | undefined): readonly AppLauncherExtraGroup[] {
  return groups ? groups.filter((group) => group.items.length > 0) : [];
}

/**
 * @internal Not public API: the development errors of a list, one message per problem (exported for the unit test).
 * The ids of the apps and of the extra items share one space: a tile of the region is found by it.
 */
export function appLauncherProblems(
  apps: readonly AppDescriptor[],
  hasOnNavigate: boolean,
  extraGroups: readonly AppLauncherExtraGroup[] = [],
  hasOnExtraItemActivate = false,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const app of apps) {
    if (seen.has(app.id)) problems.push(`two apps have the id ${JSON.stringify(app.id)}: ids must be unique`);
    seen.add(app.id);
    if (isEmptyLabel(app.label)) {
      problems.push(`the app ${JSON.stringify(app.id)} has an empty label: its tile has no accessible name`);
    }
    if (!app.disabled && !hasNavigableHref(app.href) && !hasOnNavigate) {
      problems.push(`the app ${JSON.stringify(app.id)} has no href and there is no onNavigate: its tile opens nothing`);
    }
  }
  const groupIds = new Set<string>();
  for (const group of extraGroups) {
    if (groupIds.has(group.id)) problems.push(`two extra groups have the id ${JSON.stringify(group.id)}: ids must be unique`);
    groupIds.add(group.id);
    if (isEmptyLabel(group.label)) {
      problems.push(`the extra group ${JSON.stringify(group.id)} has an empty label: its list has no accessible name`);
    }
    for (const item of group.items) {
      if (seen.has(item.id)) {
        problems.push(`the extra item ${JSON.stringify(item.id)} has the id of another app or extra item: ids must be unique`);
      }
      seen.add(item.id);
      if (isEmptyLabel(item.label)) {
        problems.push(`the extra item ${JSON.stringify(item.id)} has an empty label: its tile has no accessible name`);
      }
      if (!hasNavigableHref(item.href) && !hasOnExtraItemActivate) {
        problems.push(
          `the extra item ${JSON.stringify(item.id)} has no href and there is no onExtraItemActivate: its tile does nothing`,
        );
      }
    }
  }
  return problems;
}

/**
 * Applies the navigation rule (`internal/navigation`) to a click on a tile: a click handed to `callback` gives the
 * tile the focus first (Safari does not focus a clicked link), so a dialog opened from it returns the focus there.
 * Only a link has a native navigation to leave modified clicks to: on a button every click is the callback's.
 */
function runTileRule(
  event: MouseEvent<AppLauncherTileElement>,
  href: string | undefined,
  callback: (event: MouseEvent<AppLauncherTileElement>) => void,
): void {
  const tile = event.currentTarget;
  const rule = { native: hasNavigableHref(href) };
  if (isAppNavigationClick(event, rule) && tile.ownerDocument.activeElement !== tile) {
    tile.focus({ preventScroll: true });
  }
  handleNavigationClick(event, callback, rule);
}

/** What a tile is made of: the frame shared by the apps and the extra items. */
interface TileParts {
  key: string;
  /** Base of the ids of the tile's texts. */
  id: string;
  label: string;
  icon: ReactNode;
  href: string | undefined;
  disabled: boolean;
  current: boolean;
  describedBy: string;
  /** The `data-*` attribute that names the tile (`data-rop-app-id` for an app). */
  data: Record<string, string>;
  /** The description and the second line (a disabled app's reason, an item's badge), drawn over the tile. */
  details: ReactNode;
  ref: (element: HTMLElement | null) => void;
  onClick: (event: MouseEvent<AppLauncherTileElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/** One tile in its `<li>`: a link with an `href`, a button without one. The markup of the apps' tiles. */
function renderTile(t: TileParts) {
  const common = {
    ref: t.ref,
    'aria-labelledby': `${t.id}-label`,
    'aria-describedby': t.describedBy || undefined,
    'aria-current': t.current ? ('true' as const) : undefined,
    'aria-disabled': t.disabled ? ('true' as const) : undefined,
    ...t.data,
    onClick: t.onClick,
    onFocus: t.onFocus,
    onBlur: t.onBlur,
    className: cn(TILE, t.disabled ? TILE_DISABLED : TILE_ENABLED, t.current && TILE_CURRENT),
  };
  const hasIcon = t.icon !== undefined && t.icon !== null;
  const body = (
    <>
      {hasIcon ? (
        <span aria-hidden="true" className={cn(ICON, t.disabled && 'opacity-60')}>
          {t.icon}
        </span>
      ) : null}
      {/* The name line, then the room the description and the reason are drawn over. */}
      <span className={cn('flex min-w-0 flex-1 flex-col', TEXT_BLOCK)}>
        <TruncatedText id={`${t.id}-label`} className="font-semibold">
          {t.label}
        </TruncatedText>
      </span>
    </>
  );
  // The description and the reason are NOT inside the link: its visible text is then exactly its name
  // (WCAG 2.5.3, "label in name"), and they are read once, as its description (`aria-describedby` reads
  // hidden text; `aria-hidden` keeps them from being read again as list content). They are drawn over the
  // tile, under the name; `pointer-events: none` hands every click on them to the tile below.
  const details = t.details ? (
    <span aria-hidden="true" data-rop-app-details="" className={cn(DETAILS, hasIcon ? DETAILS_AFTER_ICON : DETAILS_NO_ICON)}>
      {t.details}
    </span>
  ) : null;
  return (
    <li key={t.key} className="relative flex min-w-0 flex-col">
      {hasNavigableHref(t.href) ? (
        // An empty `href` counts as none (a button). A disabled app keeps its `<a>` (the focus stays on it
        // if it gets disabled while focused) but loses its `href`: `role="link"` and `tabIndex` keep it a
        // named, focusable link that leads nowhere.
        <a {...common} href={t.disabled ? undefined : t.href} role={t.disabled ? 'link' : undefined} tabIndex={t.disabled ? 0 : undefined}>
          {body}
        </a>
      ) : (
        <button {...common} type="button">
          {body}
        </button>
      )}
      {details}
    </li>
  );
}

// The label of an extra group, over its list: one line, cut with an ellipsis inside the real width of the region.
// Not a heading element: the launcher does not know the heading level of the page it is put in; the label names
// the list (`aria-labelledby`), which is what a screen reader announces when it enters the list.
const GROUP = 'mt-6 flex min-w-0 flex-col gap-2';
const GROUP_LABEL = 'block max-w-full font-semibold text-rop-text-muted';
// The heading around the label (`groupHeadingLevel`): no margin and the body text, whatever the level, so that a
// heading draws exactly like the plain label.
const GROUP_HEADING = 'm-0 min-w-0 font-rop-sans text-rop-body font-semibold';

/** The level of the group headings: 2 to 6, anything else is no heading (the plain label). */
export type AppLauncherGroupHeadingLevel = 2 | 3 | 4 | 5 | 6;

const headingTagOf = (level: unknown): 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | undefined =>
  level === 2 || level === 3 || level === 4 || level === 5 || level === 6 ? `h${level}` : undefined;

/**
 * The choice of an app in a product made of several apps behind one login: a grid of tiles, one per app, from a
 * list the consumer has already filtered. Every tile is a real link (`<a href>`, so Ctrl/Cmd+click opens a new tab)
 * or, without an `href`, a button; the tiles are a list (`<ul>`) inside a named navigation region and are visited
 * with Tab in the order of `apps`. A disabled app keeps its place and its focus stop, so the reason can be read,
 * but cannot be opened.
 *
 * Columns follow the width of the launcher, not of the window (container query: 1 to 4). The launcher fills the
 * width of its parent; give a shrink-to-fit parent a real width. Loading, empty and loaded keep the same footprint
 * for the same number of tiles. If the tile with the focus disappears (the list changes), the focus moves to the
 * next app, or the previous one, or the region itself, never to the page. The region is the only root node: it holds a
 * visually hidden status element (the loading announcement); `ref`, `className` and the other attributes go to it.
 */
export const AppLauncher = /* @__PURE__ */ forwardRef<HTMLElement, AppLauncherProps>(function AppLauncher(
  {
    apps,
    onNavigate,
    currentAppId,
    loading = false,
    loadingCount,
    extraGroups,
    onExtraItemActivate,
    groupHeadingLevel,
    labels: labelsProp,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    ...rest
  },
  ref,
) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const baseId = useId();
  const root = useRef<HTMLElement | null>(null);
  const composedRef = useMemo(() => composeRefs<HTMLElement>(root, ref), [ref]);

  const keys = useMemo(() => keysOf(apps), [apps]);
  // The extra groups that are shown (none while loading) and the keys of their items: one key space for all the
  // items of the region, apart from the apps' (prefixed), so that an item moved to another group keeps its key.
  const groups = loading ? [] : shownExtraGroups(extraGroups);
  const groupKeys = keysOf(groups);
  const flatItemKeys = keysOf(
    groups.flatMap((group) => group.items),
    '\u0001',
  );
  let itemAt = 0;
  const itemKeys = groups.map((group) => flatItemKeys.slice(itemAt, (itemAt += group.items.length)));
  const shownKeys = loading ? [] : [...keys, ...itemKeys.flat()];

  // Development errors, once per distinct list (not at every render).
  const problems = appLauncherProblems(apps, !!onNavigate, extraGroups, !!onExtraItemActivate).join('\n');
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !problems) return;
    for (const problem of problems.split('\n')) console.error(`[formrail] <AppLauncher>: ${problem}.`);
  }, [problems]);

  // --- Focus that survives a change of the list -------------------------------------------------------------
  // The tile elements by key (stable callback refs, one per key) and the tile that has the focus.
  const tiles = useRef(new Map<string, { element: HTMLElement | null; ref: (el: HTMLElement | null) => void }>());
  const focused = useRef<{ key: string; element: HTMLElement } | null>(null);
  const previousKeys = useRef<readonly string[]>(shownKeys);

  const tileRef = useCallback((key: string) => {
    const known = tiles.current.get(key);
    if (known) return known.ref;
    const entry = {
      element: null as HTMLElement | null,
      ref: (element: HTMLElement | null) => {
        entry.element = element;
        if (element) tiles.current.set(key, entry);
        else tiles.current.delete(key);
      },
    };
    tiles.current.set(key, entry);
    return entry.ref;
  }, []);

  const onTileFocus = (key: string) => (event: FocusEvent<HTMLElement>) => {
    focused.current = { key, element: event.currentTarget };
  };
  // A real loss of focus (the user moved on, or clicked the page) forgets the tile. A tile removed from the page
  // may also fire a `focusout` (Chromium does, during the removal): it is told apart after the commit, when the element is no
  // longer connected; the layout effect below, which runs first, has already moved the focus.
  const onTileBlur = (event: FocusEvent<HTMLElement>) => {
    const element = event.currentTarget;
    queueMicrotask(() => {
      if (focused.current?.element === element && element.isConnected && element.ownerDocument.activeElement !== element) {
        focused.current = null;
      }
    });
  };

  useLayoutEffect(() => {
    const before = previousKeys.current;
    previousKeys.current = shownKeys;
    const last = focused.current;
    if (!last || last.element.isConnected) return;
    focused.current = null;
    const doc = last.element.ownerDocument;
    const active = doc.activeElement;
    // The focus already went somewhere real (not lost to the page): leave it there.
    if (active && active !== doc.body && active.isConnected) return;
    const alive = (key: string | undefined) => (key === undefined ? undefined : tiles.current.get(key)?.element ?? undefined);
    // The same app, re-rendered as another element (it lost or gained its `href`).
    let target: HTMLElement | null | undefined = alive(last.key);
    if (!target) {
      const index = before.indexOf(last.key);
      const after = before.slice(index + 1).find((key) => alive(key));
      const previous = [...before.slice(0, Math.max(index, 0))].reverse().find((key) => alive(key));
      target = alive(after) ?? alive(previous) ?? root.current;
    }
    target?.focus();
  });

  // --- Activation ---------------------------------------------------------------------------------------------
  const activate = (app: AppDescriptor) => (event: MouseEvent<AppLauncherTileElement>) => {
    if (app.disabled) {
      event.preventDefault();
      return;
    }
    if (!onNavigate) return;
    runTileRule(event, app.href, (e) => onNavigate(app, e));
  };
  // An extra item is never disabled; it never reaches `onNavigate`, and an app never reaches `onExtraItemActivate`.
  const activateItem = (item: AppLauncherExtraItem, group: AppLauncherExtraGroup) => (event: MouseEvent<AppLauncherTileElement>) => {
    if (!onExtraItemActivate) return;
    runTileRule(event, item.href, (e) => onExtraItemActivate(item, group, e));
  };
  const hasGroups = groups.length > 0;
  const HeadingTag = headingTagOf(groupHeadingLevel);

  const count = loading ? placeholderCount(loadingCount, apps.length) : 0;

  // The loading announcement: the status region is always mounted, empty at the first render (also on the server)
  // and filled only after the mount, because a live region inserted already filled is not reliably announced.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <nav
        {...rest}
        ref={composedRef}
        tabIndex={-1}
        aria-label={ariaLabelledBy ? ariaLabel : ariaLabel ?? labels.region}
        aria-labelledby={ariaLabelledBy}
        data-rop-app-launcher=""
        className={cn(
          'relative block min-w-0 max-w-full p-1 font-rop-sans text-rop-body text-rop-text @container',
          'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2',
          className,
        )}
      >
        {loading ? (
          <div aria-hidden="true" aria-busy="true" data-rop-app-launcher-placeholders="" className={cn(GRID, ROW_MIN_HEIGHT)}>
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="flex min-w-0 flex-col">
                <div className={cn(TILE, 'pointer-events-none')}>
                  <Skeleton variant="rect" width="2.5rem" height="2.5rem" className="shrink-0" />
                  <div className={cn('flex min-w-0 flex-1 flex-col', TEXT_BLOCK)}>
                    <Skeleton textVariant="body" width="60%" />
                    <Skeleton textVariant="body" lines={2} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div data-rop-app-launcher-empty="" className={cn('flex items-center justify-center', ROW_MIN_HEIGHT)}>
            <p className="m-0 text-center text-rop-text-muted">{labels.empty}</p>
          </div>
        ) : (
          // Named only when extra groups follow: the region then holds several lists, each with its name.
          <ul className={GRID} aria-label={hasGroups ? labels.appsGroup : undefined}>
            {apps.map((app, i) => {
              const key = keys[i]!;
              const id = `${baseId}-${i}`;
              const disabled = !!app.disabled;
              const reason = disabled && app.disabledReason ? app.disabledReason : undefined;
              return renderTile({
                key,
                id,
                label: app.label,
                icon: app.icon,
                href: app.href,
                disabled,
                current: currentAppId !== undefined && app.id === currentAppId,
                describedBy: [app.description ? `${id}-description` : '', reason ? `${id}-reason` : ''].filter(Boolean).join(' '),
                data: { 'data-rop-app-id': app.id },
                details:
                  app.description || reason ? (
                    <>
                      {app.description ? (
                        <span
                          id={`${id}-description`}
                          className={cn('overflow-hidden text-rop-text-muted', reason ? 'line-clamp-1' : 'line-clamp-2')}
                        >
                          {app.description}
                        </span>
                      ) : null}
                      {reason ? (
                        <span
                          id={`${id}-reason`}
                          data-rop-app-disabled-reason=""
                          className={cn('overflow-hidden italic text-rop-text', app.description ? 'line-clamp-1' : 'line-clamp-2')}
                        >
                          {reason}
                        </span>
                      ) : null}
                    </>
                  ) : null,
                ref: tileRef(key),
                onClick: activate(app),
                onFocus: onTileFocus(key),
                onBlur: onTileBlur,
              });
            })}
          </ul>
        )}
        {groups.map((group, g) => {
          const labelId = `${baseId}-g${g}-label`;
          return (
            <div key={groupKeys[g]} data-rop-app-launcher-group="" className={GROUP}>
              {HeadingTag ? (
                // A real heading when the consumer says which level fits the page; the list keeps its name from it.
                <HeadingTag id={labelId} className={GROUP_HEADING}>
                  <TruncatedText className={GROUP_LABEL}>{group.label}</TruncatedText>
                </HeadingTag>
              ) : (
                <TruncatedText as="div" id={labelId} className={GROUP_LABEL}>
                  {group.label}
                </TruncatedText>
              )}
              <ul className={GRID} aria-labelledby={labelId}>
                {group.items.map((item, i) => {
                  const key = itemKeys[g]![i]!;
                  const id = `${baseId}-g${g}-${i}`;
                  const badge = typeof item.badge === 'string' ? item.badge.trim() : '';
                  return renderTile({
                    key,
                    id,
                    label: item.label,
                    icon: item.icon,
                    href: item.href,
                    disabled: false,
                    current: false,
                    describedBy: [item.description ? `${id}-description` : '', badge ? `${id}-badge` : ''].filter(Boolean).join(' '),
                    data: { 'data-rop-app-launcher-item-id': item.id },
                    details:
                      item.description || badge ? (
                        <>
                          {item.description ? (
                            <span
                              id={`${id}-description`}
                              className={cn('overflow-hidden text-rop-text-muted', badge ? 'line-clamp-1' : 'line-clamp-2')}
                            >
                              {item.description}
                            </span>
                          ) : null}
                          {/* One line of the tile, the badge centred in it: neutral tone, its text is the cue. */}
                          {badge ? (
                            <span data-rop-app-launcher-badge="" className="flex min-h-[1lh] min-w-0 items-center overflow-hidden">
                              <StatusBadge id={`${id}-badge`} tone="neutral">
                                {badge}
                              </StatusBadge>
                            </span>
                          ) : null}
                        </>
                      ) : null,
                    ref: tileRef(key),
                    onClick: activateItem(item, group),
                    onFocus: onTileFocus(key),
                    onBlur: onTileBlur,
                  });
                })}
              </ul>
            </div>
          );
        })}
      {/* Inside the region (one root node), but outside the `aria-busy` placeholders, where its change would be
          withheld. If the launcher is hidden (`hidden`, `display: none`) it is not announced either. */}
      <span role="status" data-rop-app-launcher-status="" className="sr-only">
        {mounted && loading ? labels.loading : ''}
      </span>
    </nav>
  );
});
