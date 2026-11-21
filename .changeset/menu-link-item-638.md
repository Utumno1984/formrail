---
'@formrail/core': minor
---

New `MenuLinkItem` (and `MenuLinkItemProps`): a navigation item for `Menu`, a `role="menuitem"` rendered as a real
`<a href>`. A plain click or Enter navigates with the browser or, with `onNavigate`, hands the navigation to your
router: the browser's own navigation is cancelled, the menu closes and the focus returns to the trigger, then
`onNavigate` is called once (so a dirty-guard called from it remembers the trigger). A click with Ctrl, Cmd, Shift or
Alt, or with another button, stays with the browser (new tab or window) and never calls `onNavigate`. Space does not
navigate, as on any link. `disabled` removes the `href`, sets `aria-disabled` and skips the item in arrows and
typeahead. An enabled item without an `href` is a development error. `MenuItem` is unchanged.
