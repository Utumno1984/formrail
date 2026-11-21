import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type HTMLAttributes,
  type MouseEvent,
} from 'react';
import { isDev } from '../internal/is-dev';
import { handleNavigationClick, isModifiedClick } from '../internal/navigation';
import { Skeleton } from '../skeleton/Skeleton';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import type { AppDescriptor } from './types';

export interface AppLauncherLabels {
  /** Accessible name of the region (`<nav>`). Default `Apps`. */
  region: string;
  /** Text shown when the list is empty and nothing is loading. Default `No apps available`. */
  empty: string;
  /** Text read by assistive technology while the apps are loading. Default `Loading apps`. */
  loading: string;
}

/** @internal Not public API: exported only for the test of the documented defaults (label-defaults.test.tsx, #549). */
export const DEFAULT_LABELS: AppLauncherLabels = {
  region: 'Apps',
  empty: 'No apps available',
  loading: 'Loading apps',
};

/** Placeholders shown while loading when there is no list yet and no `loadingCount`. */
const DEFAULT_LOADING_COUNT = 4;

/** The element an app's tile is rendered as: a link with an `href`, a button without one. */
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
   * tile; the browser's own navigation to the `href` is cancelled first. Never called for Ctrl/Cmd/Shift/Alt+click
   * or the middle button: those are left to the browser (a new tab or window on the real `href`). The tile has the
   * focus when it is called, so a dirty guard opened from here (`useDirtyGuard().guard`) returns the focus to it.
   * Without `onNavigate` a tile with an `href` is a plain link.
   */
  onNavigate?: (app: AppDescriptor, event: MouseEvent<AppLauncherTileElement>) => void;
  /** `id` of the app the user is in: its tile gets `aria-current="true"` and a visible marker, and can still be opened. */
  currentAppId?: string;
  /**
   * Shows placeholder tiles (same size and columns as the real ones) instead of the list, and marks the region
   * `aria-busy`.
   * @default false
   */
  loading?: boolean;
  /**
   * Number of placeholder tiles while `loading`: pass the number of apps you expect, so that the region keeps its
   * height when they arrive. Default: the number of `apps` already known, or 4 when there are none.
   */
  loadingCount?: number;
  /** Texts for localization; every key falls back to the English default. */
  labels?: Partial<AppLauncherLabels>;
}

// The tiles: as many columns as the width of the launcher itself allows (a container query, never the window),
// so a launcher in a narrow side panel of a wide page has one column. Full literals (Tailwind scan).
const GRID =
  'm-0 grid list-none grid-cols-1 gap-3 p-0 @min-[32rem]:grid-cols-2 @min-[48rem]:grid-cols-3 @min-[64rem]:grid-cols-4';

// Every tile is exactly this tall, whatever it carries (no icon, no description, a reason): the name takes one
// line, the description and the reason share the two lines under it. The placeholder tile and the empty state use
// the same height, so the region does not move between loading, empty and loaded.
const TEXT_BLOCK = 'h-[calc(3*var(--text-rop-body--line-height))]';
// A tile's outer height (padding 0.75rem on each side, 1px border on each side): the minimum of the empty state.
const ROW_MIN_HEIGHT = 'min-h-[calc(3*var(--text-rop-body--line-height)+1.5rem+2px)]';

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

/** Key of each app: its `id`, made unique for a duplicate (already reported in development) so React keeps working. */
function keysOf(apps: readonly AppDescriptor[]): string[] {
  const seen = new Map<string, number>();
  return apps.map((app) => {
    const n = seen.get(app.id) ?? 0;
    seen.set(app.id, n + 1);
    return n === 0 ? app.id : `${app.id}\u0000${n}`;
  });
}

/** @internal Not public API: the development errors of a list, one message per problem (exported for the unit test). */
export function appLauncherProblems(apps: readonly AppDescriptor[], hasOnNavigate: boolean): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const app of apps) {
    if (seen.has(app.id)) problems.push(`two apps have the id ${JSON.stringify(app.id)}: ids must be unique`);
    seen.add(app.id);
    if (typeof app.label !== 'string' || app.label.trim() === '') {
      problems.push(`the app ${JSON.stringify(app.id)} has an empty label: its tile has no accessible name`);
    }
    if (!app.disabled && !app.href && !hasOnNavigate) {
      problems.push(`the app ${JSON.stringify(app.id)} has no href and there is no onNavigate: its tile opens nothing`);
    }
  }
  return problems;
}

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
 * next app, or the previous one, or the region itself, never to the page.
 */
export const AppLauncher = /* @__PURE__ */ forwardRef<HTMLElement, AppLauncherProps>(function AppLauncher(
  {
    apps,
    onNavigate,
    currentAppId,
    loading = false,
    loadingCount,
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
  const shownKeys = loading ? [] : keys;

  // Development errors, once per distinct list (not at every render).
  const problems = appLauncherProblems(apps, !!onNavigate).join('\n');
  useEffect(() => {
    if (!problems || !isDev()) return;
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
    const tile = event.currentTarget;
    // A plain click hands the tile the focus before `onNavigate` runs (Safari does not focus a clicked link), so a
    // dialog opened from `onNavigate` returns the focus to it.
    if (!event.defaultPrevented && !isModifiedClick(event) && tile.ownerDocument.activeElement !== tile) {
      tile.focus({ preventScroll: true });
    }
    handleNavigationClick(event, (e) => onNavigate(app, e));
  };

  const count = loading ? Math.max(0, Math.floor(loadingCount ?? (apps.length || DEFAULT_LOADING_COUNT))) : 0;

  return (
    <nav
      {...rest}
      ref={composedRef}
      tabIndex={-1}
      aria-label={ariaLabelledBy ? ariaLabel : ariaLabel ?? labels.region}
      aria-labelledby={ariaLabelledBy}
      aria-busy={loading || undefined}
      data-rop-app-launcher=""
      className={cn(
        'relative block min-w-0 max-w-full p-1 font-rop-sans text-rop-body text-rop-text @container',
        'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2',
        className,
      )}
    >
      <span role="status" className="sr-only">
        {loading ? labels.loading : ''}
      </span>
      {loading ? (
        <div aria-hidden="true" data-rop-app-launcher-placeholders="" className={cn(GRID, ROW_MIN_HEIGHT)}>
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
        <ul className={GRID}>
          {apps.map((app, i) => {
            const key = keys[i]!;
            const id = `${baseId}-${i}`;
            const current = currentAppId !== undefined && app.id === currentAppId;
            const disabled = !!app.disabled;
            const reason = disabled && app.disabledReason ? app.disabledReason : undefined;
            const describedBy = [app.description ? `${id}-description` : '', reason ? `${id}-reason` : '']
              .filter(Boolean)
              .join(' ');
            const common = {
              ref: tileRef(key),
              'aria-labelledby': `${id}-label`,
              'aria-describedby': describedBy || undefined,
              'aria-current': current ? ('true' as const) : undefined,
              'aria-disabled': disabled ? ('true' as const) : undefined,
              'data-rop-app-id': app.id,
              onClick: activate(app),
              onFocus: onTileFocus(key),
              onBlur: onTileBlur,
              className: cn(TILE, disabled ? TILE_DISABLED : TILE_ENABLED, current && TILE_CURRENT),
            };
            const body = (
              <>
                {app.icon !== undefined && app.icon !== null ? (
                  <span aria-hidden="true" className={cn(ICON, disabled && 'opacity-60')}>
                    {app.icon}
                  </span>
                ) : null}
                <span className={cn('flex min-w-0 flex-1 flex-col', TEXT_BLOCK)}>
                  <TruncatedText id={`${id}-label`} className="font-semibold">
                    {app.label}
                  </TruncatedText>
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
                </span>
              </>
            );
            return (
              <li key={key} className="flex min-w-0 flex-col">
                {app.href !== undefined && app.href !== '' ? (
                  // A disabled app keeps its `<a>` (the focus stays on it if it gets disabled while focused) but loses
                  // its `href`: `role="link"` and `tabIndex` keep it a named, focusable link that leads nowhere.
                  <a
                    {...common}
                    href={disabled ? undefined : app.href}
                    role={disabled ? 'link' : undefined}
                    tabIndex={disabled ? 0 : undefined}
                  >
                    {body}
                  </a>
                ) : (
                  <button {...common} type="button">
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
});
