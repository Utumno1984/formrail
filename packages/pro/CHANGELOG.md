# @formrail/pro

## 0.2.0

### Minor Changes

- f6908bc: `useFormRebase` (and the React Hook Form / TanStack Form bindings, which use the same engine): with several server
  updates in a row, the conflicts **accumulate** until they are resolved (#584). Behavior change: before, every rebase
  recomputed the conflicts from scratch, so the conflict of a first update disappeared when a second update changed
  another field (and with it the "Server changes you overwrite" warning of an app that lists them).
  
  - A conflict stays open until the user's value and the server's agree: closed by hand (`acceptTheirs`, `keepMine`,
    `acceptAllTheirs`, typing the server value), or by an update that brings the server to the user's value. An update
    that takes the server back to an older value does not close it.
  - An update that changes the field of an open conflict again: still one conflict, `theirs` the latest server value,
    `base` the value that update replaced. Conflicts are deduplicated by field (array items by id); the order in which
    the updates arrive does not change the result.
  - A successful save, `reset()`, `reset(newBaseline)` and a rehydration clear every accumulated conflict, as before.
  - `applied` does not accumulate: it stays the list of the last update.
  - The paths and labels of the conflicts are those of the last update; a conflict nested in a field that now has a
    conflict higher up is covered by it.
  
  `computeRebase` is unchanged (one merge, no memory of earlier ones).
- 69f233e: Change Summary (#424): row labels and reorders from the engine, in `@formrail/pro/engine` and `@formrail/pro`.
  
  - `ChangeSummaryOptions.itemLabel(arrayPath, item, context)`: names the array-item segments of `labelPath`
    (`Line Items > Item 2 (Chair) > Price`) while the engine still holds the item, on any array, nested ones
    included. `context` is an `ItemLabelContext` (`path`, `index`, `side`, `isLastSegment`, `defaultLabel`).
    Called lazily: only for what is reported, at most once per item and position, never while the engine only
    checks whether a subtree differs. A blank or non-string result keeps `Item N` (with a development warning
    for a non-string); an exception reaches the caller.
  - `computeChangeSummaryResult(options)`: `{ entries, reorders }`. `entries` is exactly what
    `computeChangeSummary` returns; `reorders` (`ArrayReorder[]`: `path`, `labelPath`, `label`) lists the
    id-keyed arrays whose items present on both sides changed relative order, without any synthetic entry.
  - `useChangeSummary` returns `reorders` too (additive field; `entries` and `isEmpty` keep their meaning). A
    save bar or a dirty guard driven by the summary checks `isEmpty && reorders.length === 0`.
  - New types: `ItemLabelContext`, `ArrayReorder`, `ChangeSummaryResult`.
  
  Without the new option nothing changes in `entries`. Bundle: every import that reaches the shared diff engine
  (`computeChangeSummary`, `useChangeSummary`, `computeRebase`, `useFormRebase`) grows by about 0.4-0.5 kB
  gzip; see the PR for the numbers.
- 8058c23: New entry `@formrail/pro/engine` (#489): the Change Summary and Form Rebase engines (`computeChangeSummary`, `useChangeSummary`, `inferSegmentLabel`, `formatChangeValue`, `computeRebase`, `useFormRebase` and their types) without `@formrail/core`, at runtime and in the declaration files, for a form of another library (React Hook Form, TanStack Form) or of your own. `useFormRebase` of this entry takes any form that keeps the new `RebaseFormBinding` contract (`baseline`, `values`, `isSaving`, `saveError`, `reset`, `setValues`); core's `useObjectPageForm()` is one as is. The main entry `@formrail/pro` is unchanged: same names (plus the `RebaseFormBinding` type), same `useFormRebase` signature (core's form); it imports the engines from the engine files, so an app that uses both entries loads them once. The visual components (`ChangeSummary`, `RebaseNotice`) stay in the main entry. `@formrail/core` becomes an **optional** peer dependency (`peerDependenciesMeta`): npm no longer installs it by itself. Install it next to `@formrail/pro` when you import the main entry (components, core-typed `useFormRebase`); a project that imports only `@formrail/pro/engine` does not need it. The package stays private.
- 6afb8d6: Form Rebase (#534): row labels from the engine, in `@formrail/pro/engine` and `@formrail/pro`.
  
  - `RebaseOptions.itemLabel` and `UseFormRebaseOptions.itemLabel`: the same option as
    `ChangeSummaryOptions.itemLabel` (#424), for the array-item segments of the labels of `applied`, of the
    conflicts and of the open conflicts of `useFormRebase`: `Line items > Item 2 (Chair) > Quantity` instead of
    `Line items > Item 2 > Quantity`. `ItemLabelContext.side` keeps its two values: `'values'` for an item of the
    result (the merged item, at its index there), `'baseline'` for an item that exists only in a baseline (removed
    by the server: the previous baseline; removed by the user and changed by the server: `incoming`).
  - `useFormRebase` names every open conflict at its current position, with the item as it is now in
    `form.values`: a row the user moves, renames, or with rows added or removed above it, is named as it is now.
    A row that is not in the values any more keeps the label of the rebase. `itemLabel` is compared by identity
    (pass a stable function): a stable one keeps the `conflicts` array between renders.
  - Lazy: called only for the item segments of what is reported, at most once per item and position in a rebase,
    never while the merge only decides whether a subtree changed.
  
  Without the new option nothing changes. No new runtime export. Bundle: `computeRebase` +124 B and
  `useFormRebase` +188 B gzip; see the PR for the numbers.
- 961c98c: New entry `@formrail/pro/react-hook-form` (#507): `useReactHookFormBinding(form)` binds a React Hook Form form (`useForm()`) to the `RebaseFormBinding` contract, so `useChangeSummary` and `useFormRebase` of `@formrail/pro/engine` work on it without `@formrail/core`. `binding.values` and `binding.baseline` are immutable snapshots of the values React Hook Form mutates in place, with the same identity across renders that change no value; the baseline follows React Hook Form's defaults (`form.reset(data)`, the `values` prop) and is the object passed to `binding.reset(saved)`. What `binding.reset` / `binding.setValues` change (a rebase, `acceptTheirs` / `keepMine`, `reset(saved)`) is written once, at the end of the synchronous run, with `setValue` on each changed field and `resetDefaultValues` (React Hook Form's `reset` only for a top-level key to remove): no `type: 'change'` event, no remount of the `useFieldArray` rows, `dirtyFields` only on the user's edits, `touchedFields` and `submitCount` kept, the errors of the fields the rebase did not change kept; a write of the app made after it in the same run wins on the fields it changes. `isSaving` / `saveError` map `handleSubmit` (`isSubmitting`, a failed submit; a submit ended by `binding.reset(saved)` has saved), or come from the options for a save of your own. `react-hook-form` (`^7.92.0`) is an **optional** peer dependency, used for the types only; the main entry `@formrail/pro` and `@formrail/pro/engine` do not name it. The package stays private.
- c7273e8: `<RebaseNotice />` (#384): the result of a `useFormRebase` rebase as a message strip ("This record was updated while you were editing"). It shows the count of server changes applied and every conflict with both values (rendered like `ChangeSummary`, with the same `renderValue`), the choices "Use server value" / "Keep mine" named after the field, and "Use all server values".
  - **Announcements**: once per update, from a live region that is always mounted; a pending update that changes nothing once applied is announced too (`labels.pendingNoChanges`). An update never moves the focus.
  - **Layout**: the content in view does not move when the notice appears or goes away, whatever has the focus. The scroll container follows; place the notice right above it with `scrollContainerRef`.
  - **Focus**: a choice that removes the focused button moves the focus to a live element (`focusTargetFor`).
  - **Texts**: configurable with `labels`.
  
  `useFormRebase().conflicts` are now `OpenRebaseConflict` (new exported type): each conflict also carries `currentPath` and `labelPath` (and `label`) at the item's current position. Items of id-keyed arrays are found again by id after the user moves, removes or adds items.
  
  Fix: `useFormRebase` applies a rebase in a layout effect, so a keystroke typed right after the rebase render is no longer lost.
  
  The Pro showcase "Invoices with Change Summary" gains "Simulate server update" (story-only).
- 34c1814: New entry `@formrail/pro/tanstack-form` (#508): `useTanStackFormBinding(form)` binds a TanStack Form form (`useForm()` of `@tanstack/react-form`) to the `RebaseFormBinding` contract, so `useChangeSummary` and `useFormRebase` of `@formrail/pro/engine` work on it without `@formrail/core` and without `react-hook-form`; `Values` is inferred from `useForm({ defaultValues })`. `binding.values` and `binding.baseline` are immutable snapshots with the same identity across renders that change no value (an inline `defaultValues` included); the baseline follows TanStack Form's live defaults (a new `defaultValues`, also on a touched form; `form.reset(data)`) and is the object passed to `binding.reset(saved)`. What `binding.reset` / `binding.setValues` change (a rebase, `acceptTheirs` / `keepMine`, `reset(saved)`) is written in one update of the form's base store: no field meta, no `listeners.onChange`, no validator, a top-level key removed too, the array version of a `mode="array"` field bumped. The binding never writes TanStack Form's own defaults (`useForm` re-applies its options at every render): the README documents what that means for `isDefaultValue`, `isDirty` and `form.reset()`, and recommends keeping `defaultValues` on the binding's baseline (a `saved` state that follows `binding.baseline`, as the Storybook Example does); after a change of content of `defaultValues` the binding has TanStack Form recompute its field meta, so `isDefaultValue` agrees with the summary at once (on a touched form TanStack Form's `update()` does not recompute it). `isSaving` / `saveError` map `form.handleSubmit()` (`isSubmitting`, a submit that did not succeed), or come from the options for a save of your own. `@tanstack/react-form` (`~1.33.5`, the tested minor only: the adapter reads internals of TanStack Form that are not public API) is an **optional** peer dependency, used for the types only; the main entry, `@formrail/pro/engine` and `@formrail/pro/react-hook-form` do not name it. The package stays private.

### Patch Changes

- dd8823f: `VirtualListReport`: follow-ups of the focus rule of the selection bar (#582). A bulk action that closes its `Tooltip` by force (a `TruncatedText` whose text fits again, which dispatches a `focusout` from code without moving the focus) keeps its tracking, so the focus is still handed to the header checkbox if that action is hidden afterwards; the focus is read in the root of the bar (its document, an iframe's included, or its shadow root). A `focusout` dispatched by the browser still ends the tracking of a shown action, even when the action stays the active element of its document (another window taking the focus, or, in Firefox, the focus moved from a frame to its parent page): hiding that action afterwards never moves the focus back into its document. A control that is not shown when its tracking starts (hidden as it takes the focus, or an environment without layout) no longer leaves its observers running at rest. A focus that lands outside the bar while nothing of the bar is tracked no longer re-renders the component (zero commits while tabbing or typing through other fields). The TSDoc now states the remaining limits: a slot moved to another root is not followed, and `disabled`/`inert` on the focused control are not handled. No public API change.
- ebbdcca: `ChangeSummary`: the "no changes" state is now an explicit empty state (#484). It shows a decorative check icon (`aria-hidden`) next to `emptyLabel`, inside a `role="group"` named by `label` (default `Changes`, so the name no longer disappears with the list; still no live region), and the box keeps a minimum height of a summary with one change, so it does not jump when the first change appears. A blank `emptyLabel` (`""` or only whitespace) now gives the default text `No changes` instead of an empty block that would look like a summary still loading. A `className` of the consumer (`p-0`, `min-h-0`) still wins over the defaults. No other behaviour change: the texts of single values (`Empty`, `No value`, ...) are untouched.
- e777558: `ChangeSummary`: the added / removed / changed badges have a clearer hierarchy (#485). Each is a tint of its token (`--color-rop-success` / `--color-rop-error` / `--color-rop-primary`, 12% on the surface) behind a bolder text mixed 45% with black, and a decorative shape drawn in CSS (a plus, a minus, a diamond): the text on its tint is at least 4.5:1 (WCAG AA) with the default tokens and with a redeclared primary, and the three kinds differ without colour. The 1px outline is kept, so the badge stays visible in forced-colors mode. A blank text for a kind in `valueLabels` (`added: ''`) now gives the default text instead of an empty badge. No public API change, and the text read by assistive technology is unchanged.
- 447ba6e: Docs: `VirtualListReport` / `VirtualListReportTable` document `virtualizeThreshold` (200) and `overscan` (10) with
  `@default`, and the descriptions of about 40 props no longer repeat the default already shown in the Default column
  (comments only, no change of behaviour).
- 8e15960: TSDoc for every member of the public types that had none (`UseListReportOptions`, `UseListReportReturn`,
  `ListReportColumn`, `ListReportFilter`, `ListReportSort`, `UseComboboxOptions`/`UseComboboxReturn`,
  `FieldControlProps`, the Standard Schema types, `RebaseConflict`, `UseFormRebaseOptions`, `ChangeEntry.kind`,
  ...): it now shows in the editor and on the reference pages of the Storybook, generated from the TSDoc. No
  runtime change.
- c461f88: `<RebaseNotice />` follow-ups (#470):
  - **Focus not obscured (WCAG 2.4.11)**: a field being typed in that the notice pushes out of the top strip of the scroll container is brought back below what the container keeps stuck at its top, such as a sticky Anchor Bar. Until now it could stay hidden under that bar. Any other focused control still does not move the content, also when reached with the keyboard. This choice is documented. Such a control leaves the view by a scroll of its container: it is not covered by author-created content, and it received the focus fully visible. A choice in the notice moves the focus only to a live element, with `preventScroll`.
  - **Layout**: the position is recorded again when the box the notice sits in is resized from outside, for example a consumer that caps the notice's row above the virtual keyboard. Before, the next render scrolled by that move too. At the end of the content, where the browser clamps the scroll position in the relayout, that position is no longer counted twice. A scroll made in the same task as the commit, such as a callback that scrolls or moves the focus, is still kept.
  - **Docs**: `focusTargetFor` says what to return when the conflict's field is gone, for an item the server removed.
  
  Story-only (Pro showcase "Invoices with Change Summary"):
  - After "Use server value" on a line the server removed, the focus goes to the line that took its place, else to the previous line, else to "Add line" (it was left on `<body>` when the removed line was the last).
  - The notice row is capped by the room that stays visible: 40% of the editor, and the scroller keeps 10rem, also above the virtual keyboard. The notice never goes below 3rem.
- 8610ee3: `RebaseNoticeLabels`: the TSDoc writes each default as the code has it (Default `Yours`), not with quotes inside the
  backticks. Documentation only, no type or behaviour changes.
- 3054895: List Report table (#501): when the columns do not fit the scroll container, a translucent shade marks each inline edge past
  which columns are hidden (end at first, both in the middle, start at the end; mirrored in `rtl`, set by `dir` or by
  `direction`, also after the mount). It sits above the sticky header and below every overlay, takes no pointer event, is
  `aria-hidden`, and stops before the sticky row actions column.
  New documented styling hook on the scroll container: `data-rop-overflow-start` / `data-rop-overflow-end`, set on the client
  only (on scroll and on resize, 1px tolerance). The fade uses the feedback motion tokens and is instant under reduced motion;
  in forced colours a `CanvasText` line marks the edge. Shared by `ListReportTable`, `ListReport` and, in `@formrail/pro`,
  `VirtualListReportTable` / `VirtualListReport` (no Pro source change). Nothing is rendered when every column fits.
- fcdeb64: List Report table (#562): the `data-rop-overflow-start` / `data-rop-overflow-end` attributes and the edge shades follow a
  `dir` changed after a horizontal scroll at once, also in Firefox, which moves the scroll back to the start without a
  `scroll` event: a `dir` attribute changed on the scroll container or on an ancestor is now observed (one observer,
  disconnected on unmount). A direction changed by the CSS `direction` property alone is still picked up at the next scroll
  or resize. In browsers without `color-mix()` (Safari 16.0 and 16.1) the shades are now drawn, from an `@supports not`
  fallback with the same colour and alpha; nothing changes where `color-mix()` is supported. Shared by `ListReportTable`,
  `ListReport` and, in `@formrail/pro`, `VirtualListReportTable` / `VirtualListReport` (no Pro source change).
- a491276: `VirtualListReport`: the focus rule of the selection bar (a focused control of the bulk actions that goes away hands the focus to the header checkbox) now also sees a control nested inside a wrapper of the consumer (a change of children or of `hidden`/`class`/`style` anywhere inside the bulk actions) and a control under `visibility: hidden` (e.g. "Select all N results" once the selection stops being partial because of a change that is not a gesture on it); a control with `visibility: visible` inside a hidden wrapper keeps its focus. The label `selectAllResultsDescription` of `VirtualListReportLabels` is optional (it has a default, now documented as English only like the other labels).
  
  `@formrail/core`: the observer of that rule left `ListReportFrame` for the Pro, so the Free `ListReport` no longer ships it (smaller bundle, no change of behaviour). Internal channels only: the frame's internal `keepBulkActionsFocus` is replaced by `bulkActionsSlotRef`, and `/internal` re-exports `isLaidOut`; no public API change.
- 8755727: `VirtualListReport`: the default "Select all N results" formats N in the `locale` of `useListReport` (it was always `en-US`),
  like the count and the selection text of the core floorplan. A custom `labels.selectAllResultsAction` still receives the raw number.
- 70988b4: `VirtualListReport`: below 640px without the consumer's `bulkActions`, the selection bar is one line (count and "Clear selection") with no "Select all N results" (hidden by CSS: out of the layout, the accessibility tree and the tab order); the header checkbox selects every result there. The header checkbox keeps its name ("Select all results") and gains a description, "All 10,000 results, including those not on screen", from the new optional label `selectAllResultsDescription` (absent while there is no result). With the consumer's `bulkActions`, or from 640px, the bar is unchanged. When "Select all N results" or a consumer action holds the focus and goes away (a viewport crossing 640px, `bulkActions` dropped), the focus goes to the header checkbox.
  
  `@formrail/core`: internal channels only for this (`ListReportFrame`'s internal `bulkActionsWideOnly` and `keepBulkActionsFocus`, `headSelectAllProps` on `ListReportTableShell`, `selectAllProps` on `ListReportTableHead`, all from `/internal`); no public API and no change to `ListReport`.
- Updated dependencies [1d5b6b1]
- Updated dependencies [02814fa]
- Updated dependencies [736cb9e]
- Updated dependencies [87f7f59]
- Updated dependencies [ab8098c]
- Updated dependencies [c1a8816]
- Updated dependencies [70788b4]
- Updated dependencies [592feab]
- Updated dependencies [3719b48]
- Updated dependencies [ef0c1ef]
- Updated dependencies [447ba6e]
- Updated dependencies [e953eb7]
- Updated dependencies [8e15960]
- Updated dependencies [d2a2916]
- Updated dependencies [dba9362]
- Updated dependencies [a396014]
- Updated dependencies [2ced549]
- Updated dependencies [d11417c]
- Updated dependencies [7bc62f7]
- Updated dependencies [a25cb28]
- Updated dependencies [17d9019]
- Updated dependencies [03df4b0]
- Updated dependencies [a76ceb5]
- Updated dependencies [59a52e9]
- Updated dependencies [0c5b5b1]
- Updated dependencies [b4b9e14]
- Updated dependencies [c25ec00]
- Updated dependencies [e98e3f4]
- Updated dependencies [39fe859]
- Updated dependencies [8755727]
- Updated dependencies [f724652]
- Updated dependencies [3054895]
- Updated dependencies [fcdeb64]
- Updated dependencies [5b2a71e]
- Updated dependencies [8afe399]
- Updated dependencies [0c1b1a8]
- Updated dependencies [2be809e]
- Updated dependencies [140f87e]
- Updated dependencies [229cc28]
- Updated dependencies [b529ed5]
- Updated dependencies [bb8e2f5]
- Updated dependencies [a491276]
- Updated dependencies [d3da7a9]
- Updated dependencies [26611cb]
- Updated dependencies [7c33149]
- Updated dependencies [099c9fd]
- Updated dependencies [70988b4]
  - @formrail/core@0.2.0
- e953eb7: Docs (#401): the Storybook props tables now come from `react-docgen-typescript`, so composed props types are documented in full (`ListReport`, `Accordion`, `VirtualListReport`, `VirtualListReportTable`, and the union members of `ListReportTable`, `Field` and `Button`). Demo-only controls and hook options shown as Controls are filed under "Story controls"; composed components declare their parts as `subcomponents`. TSDoc added to the props that had none (types only, no runtime change), including the Radix props the overlays pass through (`asChild`, `MenuContent`'s positioning and outside-interaction callbacks, `MenuItem`'s `disabled` / `textValue`), now redeclared with the same types; where the wrapper changes what Radix's own text promises, the prop is redeclared with a truthful description: `onCloseAutoFocus` on `DialogContent` / `SheetContent` / `MenuContent` (the focus is returned by the component, so `preventDefault()` has no effect) and the focus / outside-interaction callbacks of `DialogContent` / `SheetContent` (`dismissible={false}`) and `MenuContent` (touch tap outside a modal menu, focus moving out); `Button`'s `aria-label` / `aria-labelledby` are declared by each size branch instead of the HTML base (same accepted types). An e2e guard (`e2e/docs-props.spec.ts`) fails on an empty table, a row that is not a real prop, or a prop without TSDoc.

### Documentation and examples (no change to the package)

Stories, copy-paste examples, showcases, tests and docs tooling: nothing here changes what is published in `dist`.

- d2a2916: Docs: every converted Docs page (Data, Floorplans, Patterns, the showcases) opens with a copy-paste example whose "Show code" is a real, type-checked file importing only `@formrail/core` / `@formrail/pro`, followed by the Playground with its Controls. `Data/ListReportTable` shows the complete pattern (`useListReport` → `table`, a flex parent with `min-height: 0`); the showcases list their main source files with links to GitHub. No change to the published code.
- dba9362: Docs: the `ListReport` and `VirtualListReport` copy-paste examples have a height that follows the viewport
  (`clamp(20rem, calc(100dvh - 4rem), 40rem)`, with a `vh` fallback) instead of a fixed 420px / 480px, so a phone shows
  more rows and the page can still be scrolled past the example. Documentation and examples only, no API changes.
- a25cb28: Copy-paste examples (#493): the `MessageStrip` example wrapper forgets its focus ring when it is removed while focused, so it comes back without a ring until it receives the focus again; the wrapper carries a `data-testid`. Every `*.example.tsx` now fits in 110 columns (long imports, props and comments are wrapped), enforced by ESLint `max-len`. Documentation and examples only, no API changes.
- e98e3f4: Tests only, no type or behaviour changes: a generic test now checks that the default written in the prose of every
  key of every `*Labels` interface ("Default `Next month`.") is the value of the code, in core and Pro, every value of
  it when the prose lists several ("Default `Information`, `Success`, `Warning` and `Error`."), in order and in number.
  To read the values, the default texts of `Calendar`, `DatePicker`, `FileUpload`, `MultiSelect`, `NumberInput`,
  `Pagination` and `ToastProvider` are exported from their modules for the tests (`@internal`, not re-exported by the
  package entries: nothing new is public).
- b529ed5: Docs: copy-paste "Show code" examples for the Pro pages (ChangeSummary, Virtual List Report, Form rebase), #447. `exampleStory` (story-only) finds the examples of the packages each Storybook build includes, and the stylesheet reminder of a Pro page names the core then the Pro stylesheet. Pro README: the import order no longer lists `theme.css` together with `styles.css`. No change to the components.

## 0.1.0

This package was never published. Its 0.1.0 is versioned together with `@formrail/core@0.1.0`, which contains the entries listed under "Also in the 0.1.0 of the core package" at the end of this section.

Not published: this package is private (commercial license, to be defined) and is versioned together
with `@react-object-page/core`.

- Change Summary: `computeChangeSummary` (pure), `useChangeSummary`, `inferSegmentLabel`,
  `<ChangeSummary />` and `formatChangeValue`. `''`, `null`, `undefined` and a missing key are four
  distinct states, consistent with the dirty tracking of `useObjectPageForm`.
- `VirtualListReportTable` and `VirtualListReport`: the Free List Report with virtualized rows for
  client-side datasets of 10⁴–10⁵ rows (same props and DOM as the Free table; below
  `virtualizeThreshold` it is the Free table), range selection, `aria-rowcount`/`aria-rowindex`, SSR.
- Initial scaffold of the package (build, lint, typecheck and unit-test toolchain).

### Also in the 0.1.0 of the core package

#### Minor Changes

- 36fd5e8: `computeRebase` and `useFormRebase` (#383): three-way merge of a server update into a form being edited. Fields the user did not touch take the incoming value, touched fields keep the user's value, and fields changed by both sides in different ways are exposed as conflicts. `useFormRebase` applies the merge to a core `useObjectPageForm` through its public API (`reset` + `setValues` in one batch), queues an update that arrives during a save, and tracks the conflicts until they are resolved, the form is saved or reset. The package stays private.
- ef448e2: Rebrand (#428): the project is now **Formrail**. `@formrail/core` is renamed from `@react-object-page/core`, and `@formrail/pro` from `@react-object-page/pro`; the repository moves to `github.com/Utumno1984/formrail` and the docs to `utumno1984.github.io/formrail/`. The API, the CSS entries and the design tokens (`--color-rop-*`, `--text-rop-*`, ...) are unchanged: to migrate, replace the package name in your `package.json` and in every import (`@react-object-page/core` → `@formrail/core`, including the `/styles.css` and `/theme.css` subpaths, and `@source '../node_modules/@formrail/core/dist'` on Tailwind v4). Breaking for tooling that matches the development messages: their prefix changes from `[react-object-page]` to `[formrail]` (`[formrail/pro]` in the Pro package). This package is private and was never published, under either name.

#### Patch Changes

- 69ca66b: Docs (#407): `Forms/Input` and `Foundations/Utilities` pages, explicit sections for `useFieldControl`, `useCombobox`/`defaultComboboxFilter`, `TooltipProvider`, `DescriptionListStatus` and, in Pro, `inferSegmentLabel` and `computeRebase`; `Overlays/Menu` gets its props tables. The Introduction index lists every public page, and a guard (`scripts/docs-coverage.test.mjs`) fails when a runtime export has no Docs page or a Docs page is missing from its Introduction.
- f01cf09: List Report: `rowActionsInline` (#364) on `ListReportTable`, `ListReport` and the internal `ListReportFrame`. With `rowActionsInline={n}` the first `n` actions with an `icon` of every row are inline icon buttons (a tooltip with the label on hover/keyboard focus, named `labels.rowAction(label, rowLabel)`, default "Delete FT-2026-0001") while the table's scroll container is at least 40rem wide, followed by the "…" menu with the other actions; below 40rem every action is back in the "…" menu. The switch is CSS alone (a container query on the scroll container, not the viewport): both forms are rendered from the same descriptors and only one is displayed, so `onSelect` and `disabled` are the same in both (a disabled inline action is `aria-disabled`, focusable, and does nothing). `returnFocusRef` is the control that was used. A menu open when the form changes closes without running anything and the focus goes to the visible control of the row. The actions column is `n` icon slots wider in the wide form, the same on every row and in every state. With `rowActionsInline` the scroll container gets inline-size containment (its width must come from its parent). Default `0`: unchanged. New label `rowAction`.
  
  Row actions menu: a press on the "…" trigger now gives it the focus, so closing the menu returns the focus to that trigger instead of to the control that was focused before (e.g. another row's button).
  
  Pro: `VirtualListReportTable` and `VirtualListReport` pass `rowActionsInline` to their rows.
- 7dacd90: List Report: per-row actions. `ListReportTable` and `ListReport` accept `rowActions: (row) => readonly ListReportRowAction[]`, which adds a trailing structural column (not one of `columns`, as wide as a row is tall, sticky at the inline end so it stays in view while a narrow table scrolls sideways) with, in every row that has actions, a "…" button named "Actions for <row label>" (`labels.rowActions`, from the resolved `getRowLabel`, also without `selectable`) that opens a `Menu` with one item per action (`label`, optional `icon`, `disabled`, `tone: 'danger'`). `onSelect` receives `{ returnFocusRef }`, the row's trigger, to pass to a dialog the action opens. The header is named "Actions" (`labels.rowActionsColumn`, visually hidden); skeleton, empty, no-results and error states span the extra column. Without `rowActions` the DOM is unchanged. Exports `ListReportRowAction`, `ListReportRowActionContext`, `ListReportRowActions`. In `@formrail/pro`, `VirtualListReportTable`/`VirtualListReport` pass `rowActions` to their rows (same column and menu on the mounted rows).
- Updated dependencies [e8e9f81]
- Updated dependencies [2a9e22d]
- Updated dependencies [1cb9db4]
- Updated dependencies [88883b2]
- Updated dependencies [6fb91a1]
- Updated dependencies [69ca66b]
- Updated dependencies [950e0a2]
- Updated dependencies [eb7ebe0]
- Updated dependencies [b63286b]
- Updated dependencies [3b35740]
- Updated dependencies [43d2bee]
- Updated dependencies [f8cbc06]
- Updated dependencies [77d0b29]
- Updated dependencies [3a9f048]
- Updated dependencies [c9996c5]
- Updated dependencies [995e152]
- Updated dependencies [31d910b]
- Updated dependencies [0349725]
- Updated dependencies [efe8ff7]
- Updated dependencies [f01cf09]
- Updated dependencies [7dacd90]
- Updated dependencies [def1a13]
- Updated dependencies [675ad1c]
- Updated dependencies [d924f62]
- Updated dependencies [98616e4]
- Updated dependencies [d1b26e5]
- Updated dependencies [a154f85]
- Updated dependencies [ef448e2]
- Updated dependencies [445b011]
- Updated dependencies [a47417f]
- Updated dependencies [312ef8d]
- Updated dependencies [d8b4eaf]
- Updated dependencies [9e41f3e]
- Updated dependencies [981156d]
- Updated dependencies [f4c79c2]
- Updated dependencies [6949cca]
- Updated dependencies [86a31ee]
