// Internal: the navigation rule shared by every control of the library that leads somewhere (the app launcher, the
// app shell, the app switcher, a menu link item). Not exported from the package.
//
// The rule: a plain primary click (or Enter on a link, which the browser turns into the same click) is a navigation
// of the app, handed to the consumer's callback (any router), and the browser's own navigation is cancelled. A click
// with a modifier (Ctrl, Cmd, Shift, Alt) or with another button is the browser's: a new tab, a new window, a
// download. It is never handed to the callback and never cancelled, so the real `href` opens untouched.

/** The fields of a mouse event the rule reads (a React `MouseEvent` or a DOM one). */
export interface NavigationClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/**
 * Whether the click belongs to the browser: any modifier (Ctrl/Cmd open a new tab, Shift a new window, Alt
 * downloads) or a button other than the primary one (the middle button opens a new tab; most browsers send it as
 * `auxclick`, but some still send `click`).
 */
export function isModifiedClick(event: NavigationClickLike): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * Applies the rule to a click. With `onNavigate`, a plain primary click that nobody cancelled yet has its native
 * navigation cancelled and `onNavigate` called once, synchronously; the return value is `true`. Anything else
 * (no callback, a modified click, a click a handler already cancelled) is left alone and returns `false`: the
 * browser does what it would do anyway.
 */
export function handleNavigationClick<E extends NavigationClickLike & { preventDefault: () => void }>(
  event: E,
  onNavigate: ((event: E) => void) | undefined,
): boolean {
  if (!onNavigate || event.defaultPrevented || isModifiedClick(event)) return false;
  event.preventDefault();
  onNavigate(event);
  return true;
}
