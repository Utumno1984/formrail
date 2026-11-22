# @formrail/core

## 0.2.0

### Minor Changes

- 1d5b6b1: New `AppLauncher` (with the shared `AppDescriptor` type, `AppLauncherProps`, `AppLauncherLabels`): the choice of an app
  in a product made of several apps behind one login, from a list the consumer has already filtered. A named
  navigation region with a list of tiles; every tile is a real link (`<a href>`) or, without an `href` (or with an empty
  one), a button, named by the app's `label` with the `description` as its description. A plain click or Enter hands
  the app to `onNavigate` (any router) and cancels the browser's navigation; on a link, Ctrl/Cmd/Shift/Alt+click and
  the middle button are left to the browser, while on a button every click goes to `onNavigate`. A `disabled` app keeps its place and its focus stop, loses its `href`, has `aria-disabled` and
  shows its `disabledReason` (linked with `aria-describedby`). `currentAppId` marks the current app (`aria-current`).
  `loading` shows placeholder tiles of the same size and columns (`loadingCount`) and is announced by a status region
  next to the navigation region, the empty state keeps the height of one row, and the columns follow the width of the
  launcher (container query). Tile heights are minimums in the line height in use, so the user's own text spacing
  (WCAG 1.4.12) grows the tiles instead of cutting their text. If the focused app leaves the list,
  the focus moves to the next app, the previous one or the region. Duplicate ids, empty labels and apps that open
  nothing are reported in development.
- 02814fa: `AppLauncher` accepts extra groups of entries that can be activated but do not open an app (`extraGroups`, with the
  new types `AppLauncherExtraGroup` and `AppLauncherExtraItem`, and `onExtraItemActivate`): content of the consumer such
  as a dialog, or a page at an `href`. They are shown after the apps in the same region, each group with a visible
  label over a list named by it, while the list of the apps gets the new `labels.appsGroup` name (default `Apps`). The
  items use the same tiles, Tab order, navigation rule (a plain click or Enter goes to `onExtraItemActivate`; on a link,
  modified and middle clicks are left to the browser) and focus kept when the lists change as the apps, with an
  optional neutral `badge` read as part of the description; they are never disabled and never the current app, never
  reach `onNavigate`, and an app never reaches `onExtraItemActivate`. A group without items is not shown, the groups are
  not shown while `loading`, and without groups to show the markup is unchanged. `AppDescriptor` is unchanged. Duplicate
  ids (among groups, and among the apps and the items), empty labels and items that do nothing are reported in
  development. `groupHeadingLevel` (2 to 6, new type `AppLauncherGroupHeadingLevel`) makes the label of each group a heading
  of that level (`<h2>`…`<h6>`), still naming its list; without it the label is plain text.
- 87f7f59: New `AppShell` (with `AppShellHeader`, `AppShellNav`, `AppShellNavLink`, `AppShellMain` and their props, plus
  `AppShellLabels`): the frame of an app in a product made of several apps. A `<header>` across the top with three
  parts (`start`, `center`, `end`) whose height never depends on what they hold (`--rop-app-shell-header-height`,
  default 3.5rem), a named navigation column (`--rop-app-shell-nav-width`, default 16rem) shown from 64rem and not
  displayed below, and a `<main>` that is the only scroller of a plain page; a List Report or an Object Page placed in
  it fills it and scrolls by itself. The shell takes the dynamic viewport height (`fill="viewport"`, the default) or
  its parent's (`fill="parent"`); the document itself never scrolls. A "Skip to content" link is the first Tab stop
  and moves the focus to the content without touching the URL. `AppShellNavLink` is a real link (a plain click or
  Enter goes to `onNavigate`, a modified click opens a new tab), a button without an `href`, or your router's link
  with `asChild`; `active` sets `aria-current="page"` with a marker that is not only a colour, `disabled` keeps its
  place and focus stop. The virtual keyboard of a focused `Field` is counted once, by the content, which ends above it (its bottom
  border); a padding you give `AppShellMain` (`style` or a class) is kept whole beside it. The shell adds no
  layer of its own: dialogs, popovers and toasts stay above the header.
- ab8098c: New `AppShellNavTrigger` (with `AppShellNavTriggerProps`) and the key `openNav` of `AppShellLabels` (default `Open
  navigation`): below the breakpoint of the app shell (64rem), where the navigation column is not displayed, the button
  in the header opens the same `AppShellNav` in a Sheet from the start edge (the right one in a right-to-left page),
  titled with the navigation's name. The trigger is displayed only below the breakpoint, decided in CSS (nothing moves
  at the first paint or at hydration; from the breakpoint up it is neither drawn nor a Tab stop), and has
  `aria-haspopup="dialog"`, `aria-expanded` and, while the Sheet is open, `aria-controls`. The Sheet opens with the focus
  on the link of the current page (else the first link that can be followed); Escape, the close button or the backdrop
  close it and the focus goes back to the trigger.
  
  The children of `AppShellNav` are written once and mounted in one place at a time: the column whenever the Sheet is
  not on screen, the Sheet while it is (no duplicate `id`, one navigation landmark). In the Sheet a plain click or Enter
  on a link closes the Sheet, gives the focus to the trigger and then calls `onNavigate` (a dirty guard opened from there
  returns the focus to the trigger; a focus `onNavigate` moves to the new page stays there); a Ctrl/Cmd/Shift/Alt+click
  or the middle button on a link with an `href` is left to the browser and the Sheet stays open. When the viewport
  crosses the breakpoint with the Sheet open, the Sheet closes and the focus goes to the current link of the column;
  crossing it the other way with the focus in the column moves the focus to the trigger. An `AppShellNav` unmounted
  while the Sheet is open closes it, and the focus the Sheet held goes back to the trigger. Several triggers in one shell share the Sheet: the focus goes back to the one it was
  opened from, or to another mounted one when that one has unmounted.
  
  The Sheet's code comes with `AppShellNavTrigger`: a shell without a trigger (an app for wide screens only) does not
  ship it.
- c1a8816: New `AppSwitcher` (with `AppSwitcherProps`, `AppSwitcherLabels`, `AppSwitcherPresentation`): the switch from one app to
  another of the same product, from the header of an app, with the same `AppDescriptor` list as `AppLauncher`. A trigger
  button shows the current app and is named after it (`labels.trigger`, `aria-haspopup`, `aria-expanded`); it opens a
  Menu on a wide viewport and a Sheet below 64rem (`presentation`: `auto`, `menu`, `sheet`). With `auto` the form is chosen
  when the list opens and kept until it closes; while closed the markup is the same in every form, so server and client
  render the same. In the Menu every app is a `MenuLinkItem` (or a `MenuItem` without an `href`): the current app has
  `aria-current` and a check mark, a disabled app is skipped by the arrows and the typeahead and its reason is its
  description. In the Sheet the focus starts on the current app and Escape returns it to the trigger. A plain click or
  Enter closes the list, gives the focus back to the trigger and then calls `onNavigate` once (so a `useDirtyGuard`
  dialog returns the focus to the trigger); Ctrl/Cmd+click and the middle button are left to the browser; choosing the
  current app only closes the list; a focus that `onNavigate` moves elsewhere (to the heading of the new page) stays
  there in both forms. The Sheet opens on the click of the trigger, so a press that ends in no click (dragged off, a
  touch that becomes a scroll) opens nothing. With no app besides the current one the list shows `labels.empty` (in the
  Menu as its only item, disabled).
- 3719b48: `ConfirmDialog` / `useConfirmDialog`: new optional `confirmDisabledReason?: ReactNode` prop. When given, the confirm button is `aria-disabled="true"` (still focusable, never the native `disabled`, so the focus does not move when the reason appears or goes away while the dialog is open), described by the reason through `aria-describedby`, and a click, Enter or Space on it does nothing (`onConfirm` is not called). The reason is shown in the footer, above the buttons. Cancel, Escape and the backdrop still cancel. Without it nothing changes, and neither does it with `null`, a boolean, a blank string, `0`, `0n`, `NaN` or an array made only of those: all count as "no reason", so `count && reason` can be passed as is. The same values count as a blank `confirmLabel`, which logs the "needs a confirmLabel" `console.error` in development.
- 2a9e22d: `ConfirmDialog` / `useConfirmDialog`: new optional `initialFocus?: 'cancel' | 'confirm'` prop that chooses which button takes the focus when the dialog opens, independently of `tone`. Without it nothing changes (Cancel for `danger`, the confirm button for `default`). Use `initialFocus="cancel"` with `tone="default"` for a non-destructive review step, so a key held on the opener (Enter auto-repeat) cannot confirm it before the user has read it.
- 1cb9db4: New `ConfirmDialog` and `useConfirmDialog`: a confirmation for destructive actions built on `Dialog`, with a safe
  initial focus (Cancel for `tone="danger"`), a required `confirmLabel` that names the action, and a pending state for an
  async `onConfirm` (no double submission, no dismissal while pending, focus never lost). `useConfirmDialog` returns
  `[confirm, confirmDialog]`: `await confirm(options)` resolves `true` / `false`.
- eb7ebe0: Add `FileUpload` (#338): a "Choose files" button plus a drop area with the list of selected files (name, size, remove). It only manages the selection (`File[]`); uploading is the consumer's. `accept` (extensions, MIME types, `image/*`), `maxSize` and `maxFiles` are enforced on the picker and on drops alike, and rejected files are reported to `onReject` (the consumer shows the message as the `Field` error). Inside a `Field` it takes id, description, invalid/required and `data-rop-name`; `forced`/`locked` keep the button focusable but open nothing and accept no drop, and show the read-only styling of the other controls (dashed border, read-only surface). Emptying the list emits `[]`, never `undefined`. Exports `FileUpload`, `FileUploadProps`, `FileUploadLabels` and `FileRejection`.
- 8755727: List Report: the default texts with numbers (the count next to the title, "n of m", and the selection bar's "1,234 selected
  (56 hidden by filters)") format the numbers with `Intl.NumberFormat` in the `locale` passed to `useListReport` (the runtime
  default when absent or invalid; with server rendering pass `locale` to avoid a hydration mismatch). A custom `labels.count`
  or `labels.selectionCount` still receives the raw numbers. `UseListReportReturn` now returns the `locale` option
  (`table.locale`). The count never wraps inside the number.
- 3054895: List Report table (#501): when the columns do not fit the scroll container, a translucent shade marks each inline edge past
  which columns are hidden (end at first, both in the middle, start at the end; mirrored in `rtl`, set by `dir` or by
  `direction`, also after the mount). It sits above the sticky header and below every overlay, takes no pointer event, is
  `aria-hidden`, and stops before the sticky row actions column.
  New documented styling hook on the scroll container: `data-rop-overflow-start` / `data-rop-overflow-end`, set on the client
  only (on scroll and on resize, 1px tolerance). The fade uses the feedback motion tokens and is instant under reduced motion;
  in forced colours a `CanvasText` line marks the edge. Shared by `ListReportTable`, `ListReport` and, in `@formrail/pro`,
  `VirtualListReportTable` / `VirtualListReport` (no Pro source change). Nothing is rendered when every column fits.
- f01cf09: List Report: `rowActionsInline` (#364) on `ListReportTable`, `ListReport` and the internal `ListReportFrame`. With `rowActionsInline={n}` the first `n` actions with an `icon` of every row are inline icon buttons (a tooltip with the label on hover/keyboard focus, named `labels.rowAction(label, rowLabel)`, default "Delete FT-2026-0001") while the table's scroll container is at least 40rem wide, followed by the "…" menu with the other actions; below 40rem every action is back in the "…" menu. The switch is CSS alone (a container query on the scroll container, not the viewport): both forms are rendered from the same descriptors and only one is displayed, so `onSelect` and `disabled` are the same in both (a disabled inline action is `aria-disabled`, focusable, and does nothing). `returnFocusRef` is the control that was used. A menu open when the form changes closes without running anything and the focus goes to the visible control of the row. The actions column is `n` icon slots wider in the wide form, the same on every row and in every state. With `rowActionsInline` the scroll container gets inline-size containment (its width must come from its parent). Default `0`: unchanged. New label `rowAction`.
  
  Row actions menu: a press on the "…" trigger now gives it the focus, so closing the menu returns the focus to that trigger instead of to the control that was focused before (e.g. another row's button).
  
  Pro: `VirtualListReportTable` and `VirtualListReport` pass `rowActionsInline` to their rows.
- 7dacd90: List Report: per-row actions. `ListReportTable` and `ListReport` accept `rowActions: (row) => readonly ListReportRowAction[]`, which adds a trailing structural column (not one of `columns`, as wide as a row is tall, sticky at the inline end so it stays in view while a narrow table scrolls sideways) with, in every row that has actions, a "…" button named "Actions for <row label>" (`labels.rowActions`, from the resolved `getRowLabel`, also without `selectable`) that opens a `Menu` with one item per action (`label`, optional `icon`, `disabled`, `tone: 'danger'`). `onSelect` receives `{ returnFocusRef }`, the row's trigger, to pass to a dialog the action opens. The header is named "Actions" (`labels.rowActionsColumn`, visually hidden); skeleton, empty, no-results and error states span the extra column. Without `rowActions` the DOM is unchanged. Exports `ListReportRowAction`, `ListReportRowActionContext`, `ListReportRowActions`. In `@formrail/pro`, `VirtualListReportTable`/`VirtualListReport` pass `rowActions` to their rows (same column and menu on the mounted rows).
- 5b2a71e: New `MenuLinkItem` (and `MenuLinkItemProps`): a navigation item for `Menu`, a `role="menuitem"` rendered as a real
  `<a href>`. A plain click or Enter navigates with the browser or, with `onNavigate`, hands the navigation to your
  router: the browser's own navigation is cancelled, the menu closes and the focus returns to the trigger, then
  `onNavigate` is called once (so a dirty-guard called from it remembers the trigger). A click with Ctrl, Cmd, Shift or
  Alt, or with another button, stays with the browser (new tab or window) and never calls `onNavigate`. Space does not
  navigate, as on any link (typed during a typeahead search it is part of the search, as on a `MenuItem`). A
  middle click opens the `href` in a new tab and closes the menu. `disabled` removes the `href`, sets `aria-disabled` and skips the item in arrows and
  typeahead. An enabled item without an `href` is a development error. `MenuItem` is unchanged. Declared limits (TSDoc): Ctrl/Cmd/Shift+Enter navigates
  like a plain Enter; with a menu opened from state the focus goes to the trigger; an exit animation on `MenuContent`
  leaves the focus where it was when `onNavigate` runs.
- 675ad1c: `MenuContent` gets a `loop` prop (default `true`, the behaviour it always had): with `loop={false}` the arrow keys stop at the first / last item instead of wrapping. Internally, the touch "outside tap" swallow of `Menu`, the late-dismissal guard of `Dialog` / `Sheet` and the "next tabbable after X" / document-order helpers now live in shared `internal/` modules; no other behaviour change.
- d924f62: New `MultiSelect`: a synchronous multi-value combobox. The selected values are chips inside the field (they wrap, a long label is truncated with its full text in a tooltip on hover), the list stays open after each pick, Backspace on an empty text or a chip's remove button removes a value, and the value is in selection order (`[]` when the user removes the last one). Integrated with `Field` (forced/locked never open nor change the value), no echo for a `value` or `options` that change from outside, hidden inputs for `FormData.getAll(name)` and native form reset. Exports `MultiSelect`, `MultiSelectProps`, `MultiSelectOption`, `MultiSelectLabels`, `MultiSelectSize`.
- 98616e4: New `NumberInput` (#337): a numeric field with `role="spinbutton"`, a `number | undefined` value, `min`/`max`/`step`, ArrowUp/ArrowDown, PageUp/PageDown, Home/End and two stepper buttons (`Increase`/`Decrease`, renamable through `labels`). Typed text is a draft committed on focus loss or Enter (limited to `[min, max]`, never rounded to `step`); keys and steppers commit at once, without floating-point noise. The text follows the `locale`'s decimal separator (`.` is always accepted too, thousands separators never), the mouse wheel never changes the value, and a hidden input carries the canonical value (`"12.5"`) for `FormData`. Integrated with `Field` like `Input`: `forced`/`locked` block typing, paste, keys and steppers; no `onValueChange` for a value or locale changed from outside. Exports `NumberInput`, `NumberInputProps`, `NumberInputLabels`, `NumberInputSize`.
- ef448e2: Rebrand (#428): the project is now **Formrail**. `@formrail/core` is renamed from `@react-object-page/core`, and `@formrail/pro` from `@react-object-page/pro`; the repository moves to `github.com/Utumno1984/formrail` and the docs to `utumno1984.github.io/formrail/`. The API, the CSS entries and the design tokens (`--color-rop-*`, `--text-rop-*`, ...) are unchanged: to migrate, replace the package name in your `package.json` and in every import (`@react-object-page/core` → `@formrail/core`, including the `/styles.css` and `/theme.css` subpaths, and `@source '../node_modules/@formrail/core/dist'` on Tailwind v4). Breaking for tooling that matches the development messages: their prefix changes from `[react-object-page]` to `[formrail]` (`[formrail/pro]` in the Pro package). Entries in this changelog before this release were published under the old name.
- bb8e2f5: `useObjectPageForm`: a `save` that succeeds while the user kept typing now decides field by field, with the same rule as the React Hook Form adapter of `@formrail/pro` (#507).
  
  - Before: any edit made during the save kept all the current values, so a field the user did not touch but the server normalized (a trim, `50.123` → `50.12`) stayed dirty with the typed value.
  - After: a field edited since the save started keeps the typed value and stays dirty; every other field takes the value returned by the handler and is clean; `values` is the returned object itself when nothing differs from it.
  
  The rule descends into plain objects; an array edited during the save is kept whole (rows are never paired by position); keys removed or added by the user stay so, a key the server did not return is dropped unless the user edited it. "Edited" is decided with the default structural comparison, never with `isEqual`. A `reset` during the save still wins, and a handler that returns nothing keeps the current values against the sent baseline, as before. No signature changes.
- 445b011: Scoped theming now reaches the derived states: redeclaring `--color-rop-primary`, `--color-rop-error`, `--color-rop-surface-subtle` or `--color-rop-text-muted` on a wrapper moves the hover, pressed and read-only shades of the components inside it, instead of only the resting colour. Setting a derived token directly (for example `--color-rop-primary-hover`) keeps working as before.
  
  **Contract change:** `--color-rop-primary-hover`, `--color-rop-primary-active`, `--color-rop-error-hover`, `--color-rop-error-active`, `--color-rop-surface-pressed`, `--color-rop-readonly-surface` and `--color-rop-readonly-indicator` are no longer declared on `:root`. They are optional overrides, unset by default, so `var(--color-rop-primary-hover)` in your own CSS and `getPropertyValue()` no longer return a colour, and an alias such as `--color-rop-primary-active: var(--color-rop-primary-hover)` is now ignored in silence unless the target has a value.
  
  In your own CSS use, on the element, `var(--color-rop-primary-hover, color-mix(in srgb, var(--color-rop-primary) 80%, black))`, or in Tailwind mode the utility (`bg-rop-primary-hover`) or `--theme(--color-rop-primary-hover)`. The same formula declared on `:root` brings the bug back for inner scopes.
  
  **New requirement for Tailwind mode:** importing `theme.css` now requires `tailwindcss` 4.0.9 or later. Tailwind 4.0.0 to 4.0.8 compile it without any error but write a bare `var(--color-rop-primary-hover)`, so the derived states lose their color: a primary `Button` in hover shows white text on a transparent background. The compiled `styles.css` is not affected by the Tailwind version of your app.
  
  `tailwindcss` is now an optional peer dependency, with range `<4.0.0 || >=4.0.9`. npm treats a conflict on it as an error: with Tailwind 4.0.0 to 4.0.8 installed, `npm install` stops with `ERESOLVE` even if you only use `styles.css`, so update Tailwind. An install without Tailwind or with Tailwind 3 goes through.
- 981156d: Add `Textarea` (#336): a multi-line text control that plugs into `Field` exactly like `Input` (id, merged `aria-describedby`, `aria-invalid`, `aria-required`, `disabled`, native `readOnly` for `forced`/`locked`). Optional `autoResize` with `maxRows` makes the height follow the content without layout jumps at first paint, re-measured on external value changes, width changes, font loading and form reset. No `onChange` echo on external value changes; the user emptying it emits `''`. Exports `Textarea` and `TextareaProps`.

### Patch Changes

- 736cb9e: `AppLauncher` now renders a single root node, the `<nav>`: the loading status region moved inside it (still outside the
  `aria-busy` placeholders, which carry `aria-busy` instead of the `<nav>`), so a `space-y-*` or `divide-y-*` parent no longer
  sees an extra sibling. A launcher that is `hidden` no longer announces its loading.
- 70788b4: `Button`: the TSDoc of `size` no longer says "Default `md`" for the `icon-*` sizes, where `size` is required. One text, true
  for both branches of `ButtonProps`: `md` is the default of the text sizes; the `icon-*` sizes are passed explicitly with
  `aria-label` or `aria-labelledby`. Documentation only, no type changes.
- e8e9f81: Calendar: add a `DisabledDates` story (#367) showing `isDateDisabled` driven by a list of single dates and `from|to` ranges, with a demo-side `parseDisabledDates` helper (not exported from the package). No change to `Calendar` / `DatePicker`.
- 592feab: `ConfirmDialog`: `0n` (bigint zero) now counts as blank, like `0` and `NaN`, both as `confirmDisabledReason` (no reason: the button works) and as `confirmLabel` (logs the "needs a confirmLabel" `console.error` in development). The TSDoc of `confirmLabel` lists the values that count as a blank label.
- ef0c1ef: TSDoc: the props of the core components now declare their default with `@default` (it was missing, or written only in the prose), so the Default column of the Storybook props tables and the editor hovers show it. Documentation only, no type or behaviour changes.
- 447ba6e: Docs: `VirtualListReport` / `VirtualListReportTable` document `virtualizeThreshold` (200) and `overscan` (10) with
  `@default`, and the descriptions of about 40 props no longer repeat the default already shown in the Default column
  (comments only, no change of behaviour).
- 88883b2: Derived color tokens: the README "Tokens" section is now the single description of their contract, and it adds the opacity-modifier limit (`bg-rop-primary-hover/50` ignores an override of the derived token in browsers without `color-mix(in oklab)`); the comment in `theme.css` only describes the mechanism and points to it. No change to any token or compiled style.
- 6fb91a1: Stories only, no API or behaviour change: the `Forms/Switch` and `Forms/Checkbox` "Controlled In Form" stories now carry a Docs description explaining that a controlled component does not follow a native form reset (React owns `checked`; reset the owning state in `onReset`) (#385).
- e953eb7: Docs (#401): the Storybook props tables now come from `react-docgen-typescript`, so composed props types are documented in full (`ListReport`, `Accordion`, `VirtualListReport`, `VirtualListReportTable`, and the union members of `ListReportTable`, `Field` and `Button`). Demo-only controls and hook options shown as Controls are filed under "Story controls"; composed components declare their parts as `subcomponents`. TSDoc added to the props that had none (types only, no runtime change), including the Radix props the overlays pass through (`asChild`, `MenuContent`'s positioning and outside-interaction callbacks, `MenuItem`'s `disabled` / `textValue`), now redeclared with the same types; where the wrapper changes what Radix's own text promises, the prop is redeclared with a truthful description: `onCloseAutoFocus` on `DialogContent` / `SheetContent` / `MenuContent` (the focus is returned by the component, so `preventDefault()` has no effect) and the focus / outside-interaction callbacks of `DialogContent` / `SheetContent` (`dismissible={false}`) and `MenuContent` (touch tap outside a modal menu, focus moving out); `Button`'s `aria-label` / `aria-labelledby` are declared by each size branch instead of the HTML base (same accepted types). An e2e guard (`e2e/docs-props.spec.ts`) fails on an empty table, a row that is not a real prop, or a prop without TSDoc.
- 8e15960: TSDoc for every member of the public types that had none (`UseListReportOptions`, `UseListReportReturn`,
  `ListReportColumn`, `ListReportFilter`, `ListReportSort`, `UseComboboxOptions`/`UseComboboxReturn`,
  `FieldControlProps`, the Standard Schema types, `RebaseConflict`, `UseFormRebaseOptions`, `ChangeEntry.kind`,
  ...): it now shows in the editor and on the reference pages of the Storybook, generated from the TSDoc. No
  runtime change.
- d2a2916: Docs: every converted Docs page (Data, Floorplans, Patterns, the showcases) opens with a copy-paste example whose "Show code" is a real, type-checked file importing only `@formrail/core` / `@formrail/pro`, followed by the Playground with its Controls. `Data/ListReportTable` shows the complete pattern (`useListReport` → `table`, a flex parent with `min-height: 0`); the showcases list their main source files with links to GitHub. No change to the published code.
- 69ca66b: Docs (#407): `Forms/Input` and `Foundations/Utilities` pages, explicit sections for `useFieldControl`, `useCombobox`/`defaultComboboxFilter`, `TooltipProvider`, `DescriptionListStatus` and, in Pro, `inferSegmentLabel` and `computeRebase`; `Overlays/Menu` gets its props tables. The Introduction index lists every public page, and a guard (`scripts/docs-coverage.test.mjs`) fails when a runtime export has no Docs page or a Docs page is missing from its Introduction.
- 950e0a2: Docs (#408): `ListReport` and `ListReportTable` descriptions no longer mention `@formrail/core/internal` (moved to an implementation comment), and the package README links to English anchors and to the List Report / Object Page documentation pages. No code change.
- dba9362: Docs: the `ListReport` and `VirtualListReport` copy-paste examples have a height that follows the viewport
  (`clamp(20rem, calc(100dvh - 4rem), 40rem)`, with a `vh` fallback) instead of a fixed 420px / 480px, so a phone shows
  more rows and the page can still be scrolled past the example. Documentation and examples only, no API changes.
- a396014: Docs: the six Overlays pages (ConfirmDialog, Dialog, Menu, Sheet, Toast, Tooltip) open with a copy-paste example ("Show code"): a real overlay, closed at load and opened by its trigger. The Toast and Tooltip providers moved from the meta to the stories that need them. No change to the components.
- 2ced549: Neutral wording in the TSDoc of rowActionsInline and the row-actions labels (no runtime change).
- d11417c: Copy-paste examples: the focus ring of the MessageStrip and ConfirmDialog wrappers is drawn only when the wrapper itself has the focus, never when a descendant (the Dismiss button) does. The Theming example comment is wrapped like the rest of the example.
- 7bc62f7: Copy-paste examples: the `MessageStrip` example moves the focus to the strip when it is shown again (it no longer stays on
  the disabled button), and the `ConfirmDialog` example focuses a plain wrapper with a visible focus ring around its
  `role="status"` message, so the outcome is announced once. Documentation examples only, no change to the components.
- a25cb28: Copy-paste examples (#493): the `MessageStrip` example wrapper forgets its focus ring when it is removed while focused, so it comes back without a ring until it receives the focus again; the wrapper carries a `data-testid`. Every `*.example.tsx` now fits in 110 columns (long imports, props and comments are wrapped), enforced by ESLint `max-len`. Documentation and examples only, no API changes.
- b63286b: Fix (#292): a controlled `Checkbox` / `Switch` inside a `<form>` now realigns with its `checked` prop after a native form reset (same mechanism as `RadioGroup`). Before, the reset changed only the DOM, so the control and the React state diverged. The reset reports nothing and the next click still calls `onCheckedChange`.
- 3b35740: The List Report row selection (rest / hover / pressed) and the count flash now follow `--color-rop-primary` instead of the fixed blue scale (#293). New derived tokens `--color-rop-primary-subtle`, `--color-rop-primary-subtle-hover` and `--color-rop-primary-muted` (utilities `bg-rop-primary-subtle`, `bg-rop-primary-subtle-hover`, `border-rop-primary-muted`) use the same mix percentages as blue-50/100/300, so the default theme is unchanged.
- 43d2bee: Fix (#361): `Dialog` / `Sheet` with `dismissible={false}` now also keep the focus inside the panel when the backdrop is pressed (the browser no longer moves it to `body`), not just stay open. `ConfirmDialog` reuses this guarantee instead of its own listener.
- f8cbc06: Stories only, no API or default change: the `Foundations/Interaction states` Playground and `Internal/IconTextAlignment` stories set `loadingRowCount={1}` on their `ListReportTable`, so the empty reserved-space filler row no longer reads as a layout gap under the single real row (#375).
- 77d0b29: Comment-only change in `ListReport.stories.tsx` (JSDoc of the `Playground` story): no behavior or API change (#391).
- 3a9f048: No runtime change: replaced the Italian "Ragione sociale" / "Es. Rossi S.r.l." example in the Field, Combobox, Select, Dialog and Sheet stories and in the matching unit and e2e tests with an English equivalent (#398).
- c9996c5: Internal docs-coverage guard (#416): Docs page ids now come from Storybook's own `toId` (non-ASCII letters kept), and the automatic "part of a compound component" inference from code usage is removed: a compound component's parts count as documented only when declared explicitly in `subcomponents` of its stories file.
- 17d9019: Story-only showcase, no API or default change (#470): in the invoice editor of the CRUD showcase, the `frameRef` read by the `scrollerRef` given to `useAddons` is declared before the addons hook, so an addon that reads `scrollerRef.current` during its render gets `null` before the first commit instead of a `ReferenceError`.
  
  Also story-only: the editor's notice row (the `notice` of `useAddons`) is capped by the room that stays visible, through the new `notice-cap.ts` of the showcase, which is not exported. The cap is 40% of the visible editor. The page's scroller keeps 10rem above the line where a focused Field lands, which accounts for the virtual keyboard through `visualViewport`. The notice never goes below 3rem. The fixed `40vh` stays only as a fallback before the first measurement.
- 03df4b0: `ObjectPage`: a control reached with Tab or Shift+Tab is never even partly under the sticky Anchor Bar, nor past the bottom edge of the scroller where the save bar starts (WCAG 2.4.12 Focus Not Obscured, Enhanced; #497). Every element of the scroller outside the Anchor Bar now has a scroll margin: the bar's height plus 0.5rem at the top, the virtual keyboard's height plus 0.5rem at the bottom. The browser's own focus scrolling and `scrollIntoView` honour it, so the focus indicator stays clear too. Firefox scrolls a focused control only when it is entirely out of view, so a small fallback covers it: after a Tab moves the focus into the scroller, one frame later and before anything is painted, the scroller scrolls by the least that clears the control. It does nothing when the browser already did it, and a focus given by script outside a Tab key press, or by a click, is left alone. The Anchor Bar's `<nav>` carries `data-object-page-anchor-bar`. Sections still stop 4px below the bar, and the scroller's layout is unchanged. New story `Floorplans/Object Page/Layout/Long Form`.
- a76ceb5: Docs: copy-paste examples ("Show code") for the thirteen Forms pages (#442): Calendar, Checkbox, Combobox, DatePicker, Field, FileUpload, Input, MultiSelect, NumberInput, RadioGroup, Select, Switch and Textarea. Story-only change; no change to the components.
- 59a52e9: Forms examples: the Field example shows its error only after the field is left, and the character counters of the Input and Textarea examples are plain paragraphs instead of live regions.
- 0c5b5b1: Foundations "Show code" examples: Theming names `--color-rop-primary-contrast` for a light primary, Tokens uses the public
  `--color-rop-border` and points to the right README section, Typography uses `useId()` for the label/field pair, and
  Utilities no longer needs a type cast to show a conditional class. Documentation and examples only.
- b4b9e14: Docs: copy-paste "Show code" examples for the Foundations pages (Icon, Theming, Tokens, Typography, Utilities), #446. Stories only, no change to the components.
- 995e152: Stories only, no API or default change: test fixtures (`Internal/*` and the `*NoPlay` copies of documented stories) now carry an `internal` tag, and the public Storybook deploy hides them from the sidebar. They stay in the index and render by direct URL, and the local `npm run storybook` still lists everything.
- c25ec00: Foundations/Interaction states story: the "Not clickable" row's `Card` now wraps its text in `CardBody`, so it no longer sits flush against the border (#432). Story-only; `Card` is unchanged.
- 31d910b: Showcase invoice line items: a quantity or unit price of 1e21 or more is now rejected (it used to pass validation and
  reload as exponential text such as `1e+22`), and a line total that would reach 1e21 is not shown.
- e98e3f4: Tests only, no type or behaviour changes: a generic test now checks that the default written in the prose of every
  key of every `*Labels` interface ("Default `Next month`.") is the value of the code, in core and Pro, every value of
  it when the prose lists several ("Default `Information`, `Success`, `Warning` and `Error`."), in order and in number.
  To read the values, the default texts of `Calendar`, `DatePicker`, `FileUpload`, `MultiSelect`, `NumberInput`,
  `Pagination` and `ToastProvider` are exported from their modules for the tests (`@internal`, not re-exported by the
  package entries: nothing new is public).
- 39fe859: TSDoc of the label interfaces: every key of `ListReportTableLabels`, `PaginationLabels`, `DirtyGuardLabels`,
  `FileUploadLabels` and `ToastLabels` now states its default in the prose ("Default `Retry`."), the one convention for
  label keys (the Docs show `labels` as a single row without a Default column). `DescriptionList.emptyLabel` no longer
  repeats in its prose the default that the Default column shows. Documentation only, no type or behaviour changes.
- 0349725: `FileUpload`: the focus after removing a file is now handled by a shared internal hook (#417), also used by the invoice showcase's line items. Same behaviour (the Remove button of the file that takes the place of the removed one, else of the previous one, else "Choose files"), plus two edge fixes for a controlled `value`: a removal the consumer refuses and then follows with a different list no longer moves the focus later, and with two identical files the heir is computed on the list after the removal. The `data-file-key` attribute on the list items is gone (it was never documented). No new public API.
- efe8ff7: Documentation only, no behaviour change: reworded two JSDoc comments on `ListReportColumn.accessor` and the internal `UrlSource` type in `useListReportUrlState` that referenced internal ticket tracking ("in later tickets", "separate ticket"), which is not meaningful to consumers reading the published `.d.ts`.
- f724652: List Report: the default announcement of the number of results (the `aria-live` region of the table, `labels.resultCount`) now formats the number in the `locale` of `useListReport`, like the visible count ("10,000 results"). A custom `labels.resultCount` still receives the raw number.
- fcdeb64: List Report table (#562): the `data-rop-overflow-start` / `data-rop-overflow-end` attributes and the edge shades follow a
  `dir` changed after a horizontal scroll at once, also in Firefox, which moves the scroll back to the start without a
  `scroll` event: a `dir` attribute changed on the scroll container or on an ancestor is now observed (one observer,
  disconnected on unmount). A direction changed by the CSS `direction` property alone is still picked up at the next scroll
  or resize. In browsers without `color-mix()` (Safari 16.0 and 16.1) the shades are now drawn, from an `@supports not`
  fallback with the same colour and alpha; nothing changes where `color-mix()` is supported. Shared by `ListReportTable`,
  `ListReport` and, in `@formrail/pro`, `VirtualListReportTable` / `VirtualListReport` (no Pro source change).
- def1a13: ListReportTable / ListReport: "Retry" (error state) and "Clear filters" (no-results state) keep the focus
  on the button while the state, and so the button, stays. The focus moves to the table container only when the
  button goes away with its state (right away or later, e.g. after an async reload), and never takes back a focus
  the callback moved elsewhere. Before, it always jumped to the container, whose focus ring then framed the whole
  table (#307).
- 8afe399: `Menu`: opened with a click (or a tap) on its trigger while another control had the focus, the menu now returns the focus to its trigger when it closes (Escape, a chosen item), not to that other control. A pointer press on the trigger does not move the focus to it, so the control focused before the press was taken as the opener. Unchanged: opened from the keyboard the focus returns to the trigger as before; opened from the `open` state it returns to the element that had it; an item that opens a `Dialog` leaves the focus in the Dialog; Tab still moves on from the trigger.
- 0c1b1a8: Docs: copy-paste "Show code" examples for the Navigation pages (Accordion, Breadcrumb, Collapsible, Pagination, Tabs), #444. Stories only, no change to the components.
- d1b26e5: fix(object-page): the header actions keep their natural width beside the title from 640px, so a button label ("Approve") no longer breaks mid-word at tablet width when the title is long (#310)
- 2be809e: `ObjectPage`: with the virtual keyboard open, a focused `Field` inside the page now lands just above the keyboard instead of a save bar's height higher (#498). The keyboard's height (`--rop-keyboard-inset`, published on `<html>` by a focused `Field`) is measured from the bottom of the window, but the page's scroller ends above the save bar, which the keyboard covers first: the scroll margins of the scroller's content (the `Field`'s own, and those of #497 used by the browser's focus scrolling and the Tab fallback) counted the save bar twice. Inside the scroller the variable is now lowered by the room below the scroller (measured by the page, `--rop-object-page-bottom-gap` on the scroller), never below 0, and only when the scroller scrolls its content itself (also with an `overflow-y: hidden` set by the consumer, which `scrollIntoView` still scrolls): with no height on the page's parent the document scrolls, the keyboard covers the window's bottom edge whole, and the room below the scroller is not subtracted. A page with a height whose content fits overflows only once the keyboard's bottom padding is in: a focused `Field` now announces each new keyboard height with an internal bubbling event, and the page measures the room again before the `Field` scrolls itself, so the save bar is counted once on the first focus and after Tab/Shift+Tab too; the value on `<html>` and the scroller's own bottom padding are unchanged (the root relays the window's value as an inline `--rop-object-page-keyboard-inset`; a `style` passed to `ObjectPage` is merged with it). The shipped CSS declares no new property. No public API change.
- 140f87e: List Report: the observer of a changed `dir` now measures a table only when the attribute changes on its container or on one of its ancestors (a sibling or another branch no longer measures every mounted table), and it follows nested shadow roots outwards to the document. A container slotted into a host whose shadow tree sets `dir` above the `slot` is a documented limit. The TSDoc of `OverflowEdgesGeometry` no longer says a changed `dir` needs no measure.
- a154f85: Tabs: the overflow indicators of a horizontal tab list read the layout at most once per frame while
  scrolling (the final position of a scroll is always read), and adding or removing a tab only starts
  or stops observing that tab instead of re-observing the whole list. ObjectPage's Anchor Bar, the
  List Report table and Tabs now share one internal resize/mutation subscription; no change to their
  observable behaviour.
- 229cc28: Docs: copy-paste examples ("Show code") for the ten Primitives pages (#445): Avatar, Button, Card, Divider, FieldMessage, MessageStrip, ProgressBar, Skeleton, Spinner and StatusBadge. Story-only change; no change to the components.
- b529ed5: Docs: copy-paste "Show code" examples for the Pro pages (ChangeSummary, Virtual List Report, Form rebase), #447. `exampleStory` (story-only) finds the examples of the packages each Storybook build includes, and the stylesheet reminder of a Pro page names the core then the Pro stylesheet. Pro README: the import order no longer lists `theme.css` together with `styles.css`. No change to the components.
- a491276: `VirtualListReport`: the focus rule of the selection bar (a focused control of the bulk actions that goes away hands the focus to the header checkbox) now also sees a control nested inside a wrapper of the consumer (a change of children or of `hidden`/`class`/`style` anywhere inside the bulk actions) and a control under `visibility: hidden` (e.g. "Select all N results" once the selection stops being partial because of a change that is not a gesture on it); a control with `visibility: visible` inside a hidden wrapper keeps its focus. The label `selectAllResultsDescription` of `VirtualListReportLabels` is optional (it has a default, now documented as English only like the other labels).
  
  `@formrail/core`: the observer of that rule left `ListReportFrame` for the Pro, so the Free `ListReport` no longer ships it (smaller bundle, no change of behaviour). Internal channels only: the frame's internal `keepBulkActionsFocus` is replaced by `bulkActionsSlotRef`, and `/internal` re-exports `isLaidOut`; no public API change.
- d3da7a9: List Report: below 640px, a selection bar without `bulkActions` keeps the count and "Clear selection" on one line (the count is truncated, "Clear selection" keeps its box while hidden). With `bulkActions` the bar stays on two lines; from 640px up nothing changes. The bar carries `data-rop-bulk-actions="true"` or `"false"`, decided at render by the presence of the prop.
- 26611cb: `ListReport` selection bar without `bulkActions`, below 640px: the count keeps a minimum width of `8ch` (only below 640px; from 640px it is 0 as before) and,
  when there is no room for it next to "Clear selection" (large text, a long localized label), the bar goes to
  two lines instead of squeezing the count to a few pixels. The wrap depends only on width, text size and label,
  never on the selection, so the bar keeps the same box at 0 and at n selected. The TSDoc of `bulkActions` now
  says that the presence of the prop decides the layout (a function returning `null` counts as "with actions").
- a47417f: Follow-up to the 0.1.0 release (#269): the absolute-path safety net added there (`scripts/relativize-sourcemaps.mjs` and its regression test in `package-contract.test.ts`) only walked `dist/` non-recursively, ignored the sourcemap `sourceRoot` field, and the non-`.map` check only matched the exact path of the machine it was built on. Now the scan is recursive, `sourceRoot` is relativized too, and the test also flags any path-shaped absolute string, not just this checkout's own path. No change to the published files themselves — `dist/` already had no absolute paths.
- 312ef8d: Stories only, no API or default change: the `StateMatrix` stories of Checkbox, Switch and RadioGroup no longer reserve the Field error line (`reserveMessageSpace={false}`) and use a uniform 24px grid gap, so the space between adjacent entries is the same everywhere in the single-column reflow on mobile (an "invalid" entry used to fill the reserved line with its error, leaving a narrower gap before the next group).
- d8b4eaf: Stories only, no API or default change: the Object Page / Object Page Footer stories (and the validation and schema recipes) now render the main action (Save, Approve) as an explicit `variant="primary"` next to the secondary Cancel / Discard / Reject, as the Introduction and Showcase already did. `Button` keeps `secondary` as its default.
- 9e41f3e: `TabsList` (horizontal): when the tabs do not fit, the list no longer looks cut off at its edge. Each side that hides tabs shows an indicator (a fade ending in a chevron, `aria-hidden`, not focusable); clicking it scrolls one view towards that side. The native scrollbar of the horizontal list is hidden in favour of the indicators, and `scroll-padding` keeps a tab brought into view by the arrow keys clear of the indicator. The tablist is now wrapped in a `<div data-rop-tabs-scroll>` (a positioning box when horizontal, `display: contents` when vertical, so a vertical layout is unchanged and switching orientation never remounts the list); the `ref`, `className` and props of `TabsList` still go to the `role="tablist"` element.
- f4c79c2: No runtime change: new `Foundations/Theming` Storybook story with a live switcher (presets and a custom primary colour) that redeclares the `--color-rop-*` custom properties on a wrapper, and an Introduction link to it.
- 7c33149: Anchor Bar: add the missing spacing between the Details button and the Filler box in the `TooltipOverBar` story (#434). Story-only change, no change to `ObjectPageSection`.
- 6949cca: No runtime change: translated the Italian strings left in Storybook stories and shared demo fixtures to English (including the "Object Page with Validation" story title, so its Storybook URL changes), made the demo supplier name consistent ("Bianchi Supplies"), and updated the matching e2e assertions.
- 86a31ee: No runtime change: translated the remaining Italian strings in Storybook stories and unit tests to English (and updated the matching e2e assertions), and replaced the Italian example in the `normalize-text` JSDoc with an English/Portuguese one.
- 099c9fd: TSDoc: `Accordion` `type`, `value`, `defaultValue` and `onValueChange`, `Text` `as` and `StandardSchemaResult.issues` now carry one description, the same in every branch of their union, so the Docs props table shows it once instead of two joined texts.
- 70988b4: `VirtualListReport`: below 640px without the consumer's `bulkActions`, the selection bar is one line (count and "Clear selection") with no "Select all N results" (hidden by CSS: out of the layout, the accessibility tree and the tab order); the header checkbox selects every result there. The header checkbox keeps its name ("Select all results") and gains a description, "All 10,000 results, including those not on screen", from the new optional label `selectAllResultsDescription` (absent while there is no result). With the consumer's `bulkActions`, or from 640px, the bar is unchanged. When "Select all N results" or a consumer action holds the focus and goes away (a viewport crossing 640px, `bulkActions` dropped), the focus goes to the header checkbox.
  
  `@formrail/core`: internal channels only for this (`ListReportFrame`'s internal `bulkActionsWideOnly` and `keepBulkActionsFocus`, `headSelectAllProps` on `ListReportTableShell`, `selectAllProps` on `ListReportTableHead`, all from `/internal`); no public API and no change to `ListReport`.

## 0.1.0

First public release.

`0.x` on purpose: the component set is complete for the Free tier and heavily tested, but there are no
external consumers yet, so the API may still settle with the first real feedback. Until `1.0.0`,
breaking changes are shipped in a minor release and called out here.

### Styles and foundations

- Design tokens as CSS variables in the `rop` namespace (semantic colors, type scale, `sans`/`mono`
  families, radii, a disciplined z-index scale `sticky < overlay < modal < popover < toast < tooltip`,
  motion tokens; animations are disabled under `prefers-reduced-motion`).
- Two alternative CSS entries: `@react-object-page/core/styles.css` (compiled, no preflight, utilities in
  namespaced `@layer`s so your own CSS wins) and `@react-object-page/core/theme.css` (tokens + `@theme`
  for Tailwind v4 projects, including the `rop-hover:` variant: hover only under
  `(hover: hover) and (pointer: fine)`).
- `cn()` helper (clsx + tailwind-merge aware of the tokens) and `composeRefs`.
- `sideEffects` is `["**/*.css"]`; ESM, CJS and type declarations.

### Primitives

- **Typography and icons**: `Text`, `Title`, `Icon` (icon scale `xs`–`xl`, decorative unless labelled).
- **Actions and feedback**: `Button` (variants, sizes incl. `inline`, icon-only sizes, `asChild`),
  `StatusBadge`, `MessageStrip`, `FieldMessage`, `Spinner`, `Skeleton`, `ProgressBar`, `Avatar`,
  `Divider`, `Card`, `DescriptionList` / `DescriptionListStatus`, `TruncatedText`, `Tooltip` / `TooltipProvider`,
  `ToastProvider` / `useToast`.
- **Form controls**: `Field` (label, help, error, `required`, `disabled | forced | locked` states wired
  with real `aria-describedby`, on-screen keyboard aware; `useFieldControl` and a render prop connect
  any custom control), `Input`, `Checkbox`, `Switch`, `RadioGroup`,
  `Select`, `Combobox` / `useCombobox` (+ `defaultComboboxFilter`), `Calendar`, `DatePicker`, `ValidationProvider`. Controlled
  components never call `onChange`-style callbacks for changes coming from outside (no echo).
- **Navigation and disclosure**: `Tabs`, `Accordion`, `Collapsible`, `Breadcrumb`, `Pagination`, `Menu`.
- **Overlays**: `Dialog`, `Sheet` (animated, focus returned to the opener, follow the visual viewport),
  `Menu`, `Select`/`Combobox` popovers, `Tooltip`, `Toast`: one shared layer scale, popovers always
  above modals.

### Floorplans and hooks

- **List Report**: `ListReport`, `ListReportTable`, `ListReportFilterBar` and the headless
  `useListReport` (sorting, single-choice filter pills, text search, opt-in multiple selection),
  with a stable footprint across loading / empty / no-results / error states, live-region
  announcements, `useListReportUrlState` (browser History or a router adapter) and
  `useListReportScrollRestoration`.
- **Object Page**: `ObjectPage`, `ObjectPageHeader`, `ObjectPageSection`, the anchor bar (scroll-spy,
  keyboard and reduced-motion friendly) and `ObjectPageFooter` (sticky save bar that always reserves
  its space).
- **Forms and dirty tracking**: `useObjectPageForm` (baseline-based `isDirty` that late-arriving data
  never makes dirty, `reset(newBaseline)`, `save`, validation with any
  [Standard Schema](https://standardschema.dev) library or a `validate` function, field and form
  errors), `useFocusFirstInvalidField`, `getErrorSummary` and `useDirtyGuard` (unsaved-changes
  confirmation dialog: wrap your own navigation in `guard(action)`; it also registers `beforeunload`
  and, best effort, intercepts browser Back/Forward, reliably only where the Navigation API exists).
  No router integration.

### Notes

- Built-in fallback texts are in English; every label can be overridden through props.
- `@react-object-page/core/internal` exposes building blocks shared with the companion
  `@react-object-page/pro` package. It is **not public API** and has no semver guarantee.
- Peer dependencies: React 18 or 19 and `react-dom`. Runtime dependencies: Radix UI primitives,
  `clsx`, `tailwind-merge`.
- Live demo and documentation: https://utumno1984.github.io/react-object-page/
