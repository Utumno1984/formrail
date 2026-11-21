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
   * `onNavigate` can open the app.
   */
  href?: string;
  /** The app is visible but cannot be opened. It stays focusable, so that `disabledReason` can be read. */
  disabled?: boolean;
  /** Why the app cannot be opened: shown on the tile and linked to it with `aria-describedby`. */
  disabledReason?: string;
}
