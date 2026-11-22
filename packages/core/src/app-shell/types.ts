import type { ReactNode } from 'react';

/**
 * One app the user can open, as the consumer decides it: the library receives the list already filtered (by roles,
 * permissions, organisation, whatever the product uses) and knows nothing about why an app is there or disabled.
 * Shared by `AppLauncher` and the other app-shell components.
 */
export interface AppDescriptor {
  /** Stable, unique identifier (React key, `currentAppId`). Two apps with the same `id` are an error in development. */
  id: string;
  /** Visible name of the app, and the accessible name of its tile. Must not be empty (an error in development). */
  label: string;
  /** One or two lines under the name. Read as the tile's description (`aria-describedby`), not as part of its name. */
  description?: string;
  /** Decorative icon or logo (hidden from assistive technology: the name is the `label`). */
  icon?: ReactNode;
  /**
   * Where the app lives. With an `href` the tile is a real link: Ctrl/Cmd/Shift+click and the middle button open
   * it in a new tab or window, whatever `onNavigate` does. Without one the tile is a button, and only
   * `onNavigate` can open the app: every click on it, modifiers included, goes to `onNavigate`. An empty string
   * (`href: ''`) counts as no `href`: the tile is a button (an `<a href="">` would reload the current page).
   */
  href?: string;
  /** The app is visible but cannot be opened. It stays focusable, so that `disabledReason` can be read. */
  disabled?: boolean;
  /** Why the app cannot be opened: shown on the tile and linked to it with `aria-describedby`. */
  disabledReason?: string;
}

/**
 * An entry of an extra group of `AppLauncher` (`extraGroups`): a tile the user can activate that does not open an
 * app, for example to open content of the consumer (a dialog, a request) or a page at an `href`. Not an
 * `AppDescriptor`: the other app-shell components never receive these entries. It is never disabled and never
 * marked as the current app.
 */
export interface AppLauncherExtraItem {
  /**
   * Stable identifier, unique among all the apps and extra items of the launcher (React key, the focus kept when the
   * list changes). The same `id` twice, or the `id` of an app, is an error in development.
   */
  id: string;
  /** Visible name of the entry, and the accessible name of its tile. Must not be empty (an error in development). */
  label: string;
  /** One or two lines under the name. Read as the tile's description (`aria-describedby`), not as part of its name. */
  description?: string;
  /** Decorative icon (hidden from assistive technology: the name is the `label`). */
  icon?: ReactNode;
  /**
   * Where the entry leads, with the same rule as `AppDescriptor.href`. With an `href` the tile is a real link:
   * Ctrl/Cmd/Shift/Alt+click and the middle button open it in a new tab or window, whatever `onExtraItemActivate`
   * does. Without one (or with an empty string) the tile is a button, and only `onExtraItemActivate` can act on
   * it: every click on it, modifiers included, goes to `onExtraItemActivate`.
   */
  href?: string;
  /**
   * A short text shown on the tile under the description, with a neutral look (visible text, not a colour). Read
   * as part of the tile's description (`aria-describedby`), not of its name. Empty or only spaces: not shown.
   */
  badge?: string;
}

/** A labelled group of extra entries of `AppLauncher` (`extraGroups`), shown after the apps. */
export interface AppLauncherExtraGroup {
  /** Stable identifier, unique among the groups (React key). The same `id` twice is an error in development. */
  id: string;
  /** Visible label of the group, and the accessible name of its list. Must not be empty (an error in development). */
  label: string;
  /** The entries, in the order the user sees and tabs through them. A group without entries is not shown. */
  items: readonly AppLauncherExtraItem[];
}
