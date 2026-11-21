---
'@formrail/core': minor
---

New `AppSwitcher` (with `AppSwitcherProps`, `AppSwitcherLabels`, `AppSwitcherPresentation`): the switch from one app to
another of the same product, from the header of an app, with the same `AppDescriptor` list as `AppLauncher`. A trigger
button shows the current app and is named after it (`labels.trigger`, `aria-haspopup`, `aria-expanded`); it opens a
Menu on a wide viewport and a Sheet below 64rem (`presentation`: `auto`, `menu`, `sheet`). With `auto` the form is chosen
when the list opens and kept until it closes; while closed the markup is the same in every form, so server and client
render the same. In the Menu every app is a `MenuLinkItem` (or a `MenuItem` without an `href`): the current app has
`aria-current` and a check mark, a disabled app is skipped by the arrows and the typeahead and its reason is its
description. In the Sheet the focus starts on the current app and Escape returns it to the trigger. A plain click or
Enter closes the list, gives the focus back to the trigger and then calls `onNavigate` once (so a `useDirtyGuard`
dialog returns the focus to the trigger); Ctrl/Cmd+click and the middle button are left to the browser; choosing the
current app only closes the list. With no app besides the current one the list shows `labels.empty`.
