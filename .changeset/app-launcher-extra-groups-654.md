---
'@formrail/core': minor
---

`AppLauncher` accepts extra groups of entries that can be activated but do not open an app (`extraGroups`, with the
new types `AppLauncherExtraGroup` and `AppLauncherExtraItem`, and `onExtraItemActivate`): content of the consumer such
as a dialog, or a page at an `href`. They are shown after the apps in the same region, each group with a visible
label over a list named by it, while the list of the apps gets the new `labels.appsGroup` name (default `Apps`). The
items use the same tiles, Tab order, navigation rule (a plain click or Enter goes to `onExtraItemActivate`; on a link,
modified and middle clicks are left to the browser) and focus kept when the lists change as the apps, with an
optional neutral `badge` read as part of the description; they are never disabled and never the current app, never
reach `onNavigate`, and an app never reaches `onExtraItemActivate`. A group without items is not shown, the groups are
not shown while `loading`, and without groups to show the markup is unchanged. `AppDescriptor` is unchanged. Duplicate
ids (among groups, and among the apps and the items), empty labels and items that do nothing are reported in
development.
