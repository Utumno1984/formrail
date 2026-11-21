---
'@formrail/core': minor
---

New `MenuLinkItem` (and `MenuLinkItemProps`): a navigation item for `Menu`, a `role="menuitem"` rendered as a real
`<a href>`. A plain click or Enter navigates with the browser or, with `onNavigate`, hands the navigation to your
router: the browser's own navigation is cancelled, the menu closes and the focus returns to the trigger, then
`onNavigate` is called once (so a dirty-guard called from it remembers the trigger). A click with Ctrl, Cmd, Shift or
Alt, or with another button, stays with the browser (new tab or window) and never calls `onNavigate`. Space does not
navigate, as on any link (typed during a typeahead search it is part of the search, as on a `MenuItem`). A
middle click opens the `href` in a new tab and closes the menu. `disabled` removes the `href`, sets `aria-disabled` and skips the item in arrows and
typeahead. An enabled item without an `href` is a development error. `MenuItem` is unchanged. Declared limits (TSDoc): Ctrl/Cmd/Shift+Enter navigates
like a plain Enter; with a menu opened from state the focus goes to the trigger; an exit animation on `MenuContent`
leaves the focus where it was when `onNavigate` runs.
