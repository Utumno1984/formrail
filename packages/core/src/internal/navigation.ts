// Internal: the navigation rule shared by every control of the library that leads somewhere (the app launcher, the
// app shell, the app switcher, a menu link item). Not exported from the package.
//
// The rule depends on whether the control has a native navigation, that is a real `href`:
// - With an `href` (a link): a plain primary click (or Enter, which the browser turns into the same click) is a
//   navigation of the app, handed to the consumer's callback (any router), and the browser's own navigation is
//   cancelled. A click with a modifier (Ctrl, Cmd, Shift, Alt) or with another button is the browser's: a new tab, a
//   new window, a download. It is never handed to the callback and never cancelled, so the real `href` opens
//   untouched.
// - Without an `href` (a button, or an empty `href`): the browser has nothing to open, so leaving a modified click to
//   it would only lose the gesture. Every click is the app's and goes to the callback, modifiers included.
// In both cases a click another handler already cancelled is left alone, and without a callback nothing is done.

/** The fields of a mouse event the rule reads (a React `MouseEvent` or a DOM one). */
export interface NavigationClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export interface NavigationClickOptions {
  /**
   * Whether the control has a native navigation: a real `href` (see `hasNavigableHref`). Without one, a modified
   * click goes to the callback like a plain one.
   * @default true
   */
  native?: boolean;
}

/** Whether an `href` leads somewhere: `undefined`, `null` and `''` do not (an empty `href` counts as no `href`). */
export function hasNavigableHref(href: string | null | undefined): href is string {
  return typeof href === 'string' && href !== '';
}

/**
 * Whether the click belongs to the browser on a link: any modifier (Ctrl/Cmd open a new tab, Shift a new window,
 * Alt downloads) or a button other than the primary one (the middle button opens a new tab; most browsers send it
 * as `auxclick`, but some still send `click`).
 */
export function isModifiedClick(event: NavigationClickLike): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * Whether the rule hands the click to the app (the callback) rather than to the browser: nobody cancelled it yet,
 * and either it is a plain primary click or the control has no native navigation.
 */
export function isAppNavigationClick(event: NavigationClickLike, options: NavigationClickOptions = {}): boolean {
  const native = options.native ?? true;
  return !event.defaultPrevented && (!native || !isModifiedClick(event));
}

/**
 * Applies the rule to a click. With `onNavigate`, a click the rule hands to the app (`isAppNavigationClick`) has its
 * native behaviour cancelled and `onNavigate` called once, synchronously; the return value is `true`. Anything else
 * (no callback, a modified click on a control with an `href`, a click a handler already cancelled) is left alone and
 * returns `false`: the browser does what it would do anyway.
 */
export function handleNavigationClick<E extends NavigationClickLike & { preventDefault: () => void }>(
  event: E,
  onNavigate: ((event: E) => void) | undefined,
  options: NavigationClickOptions = {},
): boolean {
  if (!onNavigate || !isAppNavigationClick(event, options)) return false;
  event.preventDefault();
  onNavigate(event);
  return true;
}
