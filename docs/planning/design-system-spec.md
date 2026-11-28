# Enterprise-admin React design system: restart specification (open-core)

> Planning document. No code, no file structure, no class or variable name from anyone else's
> codebase is reproduced here: every idea is restated in generic terms of enterprise UI design that
> are widespread in the industry. Goal: restart as an independent React design system, first used by
> the maintainer in their own projects and monetised with an **open-core** model (free MIT core +
> paid Pro package).

## 0. Positioning: generic enterprise UI patterns

The chosen architectural pattern (list with filters → preview panel → sectioned editor with
save-bar/dirty-guard) **is not a proprietary invention**: it is a composition pattern widespread
across enterprise/admin software, implemented in very similar forms by dozens of independent design
systems and libraries:

- **List Report** — list view with a filter bar (pill/segmented filters + search), table with
  configurable columns, multiple selection and bulk actions, empty/loading states.
- **Object Page** — sectioned editor with navigation anchored to the sections, a **header** with the
  object's identity and actions, a sticky **footer/save-bar**, handling of the "dirty" state before
  leaving.

This is **good strategic news**, not just a curiosity: these are generic interaction and composition
patterns, free of implementation copyright, that anyone can document and implement without anchoring
to a specific product. From here on:

- Component names stay generic and descriptive (**List Report**, **Object Page**,
  **Object Page Header**, **Anchor Bar**, **Filter Bar**, **Message Strip** for status/error
  banners, **Status Badge** for record-status badges), without citing or implying affiliation with a
  specific commercial product.
- The legitimacy of the project does not depend on "being inspired by earlier work": it depends on
  being an independent, free React implementation of enterprise patterns that are already widespread
  and described in the abstract. This must be written clearly in the README/positioning of the final
  project, without naming specific products or companies.
- See §5 for the assessment of the commercial positioning.

---

## 1. Inventory of components/patterns

For each: function, why it is useful, real technical difficulty, known pitfalls of a general class
(restated as design principles, not as bugs of a specific codebase).

### 1.1 List Report (list with filters) — **difficulty: medium-high**

Table/grid with: configurable columns (alignment, width, truncation with tooltip), sorting, multiple
selection + bulk action bar, pagination (client-side and server-side as variants of the same
component), text search, pill/segmented filters (Smart Filter Bar), empty/loading/error states with a
**dimensionally stable footprint** (same width/height while loading, empty and with data, to avoid
layout jumps), optionally **virtualization** for large datasets.

**Known pitfalls of a general class:**
- A loading placeholder that does not respect the same footprint (`width`/`height`) as the final
  content produces a visible layout jump on the first render with data.
- Sorting on the first click must follow an explicit, tested contract (ascending vs descending by
  default), not the "natural" order of the data type.
- Virtualization must be explicitly disabled when the dataset is small/empty: a virtualizer that
  stays "observing" a container with zero rows wastes cycles and can produce inconsistent edge
  behaviour (scroll, height).
- A cell with truncated text must have a real `max-width` on the container, not only
  `text-overflow`: without a width constraint the cell expands and breaks the horizontal containment
  of the whole table.
- A truncation tooltip that opens at **mount** (instead of on real hover/focus) covers content that
  was not requested and must be gated on the user event, not on render.
- An action in an **overflow menu ("…")** that wraps a custom component must inherit
  `onClick`/`disabled` from that component: a common bug pattern is "works as a direct button, does
  not work from the overflow" because extracting the label+icon for the menu discards the handler.

### 1.2 Smart Filter Bar — **difficulty: medium**

Filter bar with search + pill/segmented filters, synchronized with the URL state. Pitfalls: keep the
scroll position and filters when an action is cancelled (e.g. "New" → "Cancel" must not lose the
current page/filters); a filter that changes while the user is still typing in the URL/history must
not "go back" on its own (a "committed" value distinct from the value typed in real time is needed).

### 1.3 Preview panel (intermediate panel, L2) — **difficulty: medium**

Preview panel shown when a row is selected, before opening the full editor. It contains a
**Description List** (read-only key-value pairs) with two layout modes: inline (value on the right)
and stacked/responsive (value below, on a narrow container via container query), plus summary rows
and a status badge (**Object Status**, e.g. "Archived").

**Known pitfalls of a general class:**
- The two layout modes (inline/stacked) must align the **string value** and the **custom value
  (React node)** with the same alignment rule: handling them with different CSS rules produces
  misalignments visible only when both kinds of value appear in the same view.
- A status/audit badge (e.g. "Archived on... by...") is not guaranteed to be available on every
  entity: the per-entity data contract must be checked individually, not assumed uniform "on all
  procedures" just because it is true for the majority.
- Always reserve the space of the status row even when it is absent, to avoid a vertical jump when
  the status appears/disappears.

### 1.4 Object Page (sectioned editor, L3) — **difficulty: high**

Editor with an **Anchor Bar** (anchored, navigable sections), a **header** with primary/secondary
actions (the pitfall of §1.1 on the overflow menu applies here too), a **sticky footer with
save-bar**, a **dirty-guard** (warning before leaving with unsaved changes), a **Change Summary**
(readable summary of the fields actually modified with respect to the original value).

**Known pitfalls of a general class — these are probably the core of the real technical moat:**
- **Correct dirty-tracking** requires distinguishing "the form was hydrated with a new external
  value" from "the user typed something": a field that receives its value from outside after mount
  (e.g. data that arrived asynchronously) must not mark the form as dirty, nor **overwrite** the
  value that has just arrived with an "echo" of the previous value. This is a subtle and recurring
  class of bugs in library-controlled components: when the external value of a control changes after
  mount, the control itself calls its own `onChange` handler, and if that handler writes into the
  form state, the fresh data is silently replaced by an old value.
  **Design principle to apply in the new DS**: a control that receives its value from outside
  (hydration) must never propagate that event as if it were a user gesture; if the underlying
  library does so on its own, an explicit way is needed to distinguish "system echo" from "user
  intent" (e.g. distinct sentinel values for "the library cleared it" vs "the option is no longer in
  the catalogue" vs "no real change").
  The most robust way to avoid it at the root is to mount the controls **already hydrated** (the form
  is born with the final values, it does not receive them later), but this requires architectural
  discipline (separating "fetch in progress" from "editor mounted") that cannot always be applied
  lightly.
- A reliable **Change Summary** requires computing the diff against the value actually saved on the
  server (baseline), not against a static default, and must handle empty strings vs absent values vs
  `null` well (canonical rule: **Absent-values rule**, §1.13.1).
- **Fields with "forced/locked/disabled" states** (the value is determined by a business rule, not by
  the user) must: (a) be truly non-interactive even from the keyboard (not only visually "dimmed" for
  the mouse), (b) expose an explanation linked via a real `aria-describedby`, not a disconnected
  visual text. To do this well the field API must offer a **render-prop/hook** channel that injects
  `disabled`/`aria-disabled`/`aria-describedby` into the arbitrary child control — a plain
  `children: ReactNode` is not enough, because there is no way to "pass in" those properties to a
  generic control.
- **Sticky save-bar**: the height occupied by the footer must be reserved even before it
  appears/disappears (dirty → non-dirty), so as not to make the scrollable content above jump.

### 1.5 Data layer — **difficulty: high (it is infrastructure, not UI)**

A combination of: a runtime validation schema (Zod-like) shared between form and API call (acts as an
FE↔BE "contract check": a field missing from the real response makes the parse fail loudly instead of
silently propagating `undefined`), a query/cache hook (TanStack Query-like) with "in place" cache
update after a write (without requiring a full refetch), explicit handling of server-side
duplicate/validation errors mapped to field messages.

**Known pitfalls of a general class:**
- An asynchronous search with fast typing must guarantee that the response for an **outdated** term
  does not overwrite that of the most recent term (the classic race condition on concurrent requests:
  track which request is "the last" and discard the others on arrival).
- A selected value that is not among the results of the last search (because the user kept typing
  after choosing) must stay visible: the UI must not "lose" the selection just because it does not
  appear in the current filtered list.
- During an IME composition the text is provisional: no search or commit until `compositionend`
  arrives, and Enter does not select (**IME composition**, §1.13.5).

### 1.6 Overlay primitives: Dialog, Select/Combobox, Popover, Tooltip, Sheet — **difficulty: high**

These are the primitives with the **widest blast radius** in the system (every consumer uses them):
any regression here propagates to all screens. Known pitfalls of a general class, all real and
recurring in design systems built on headless primitives (e.g. Radix):

- **Disciplined z-index scale**: "portalled" content (the popover of a Select/Combobox inside a
  Dialog) must respect a z-index scale consistent with the whole system (popover always above modal,
  modal always above background overlay). Using the base library's default z-index without
  harmonizing it with one's own scale produces popovers that are "invisible to clicks" because they
  end up under the overlay of the dialog that contains them — a bug that is not seen in the simple
  case (it is seen only when composing Select inside Dialog).
- **Style overrides via className must really win**: a class composition mechanism that does simple
  concatenation (without a real "merge" of conflicting CSS utilities) lets the component's default
  classes (e.g. sizes) keep winning over the classes passed by the consumer. A real merge of
  conflicting classes (Tailwind-merge style) is needed, not just concatenation.
- **Stacking/accessibility of dialogs driven by application state** (opening not originated by a
  direct trigger of the primitive, but by an external state variable): the internal mechanism that a
  headless library uses to "know when to open/close" may not activate at all if the opening does not
  go through its intended channel, with subtle accessibility effects (e.g. the open element is not
  announced as a dialog to screen readers, although visually correct and although passing the
  functional tests). **Principle**: if the DS offers a "state-controlled" way of opening an overlay,
  it must guarantee that all internal bookkeeping (overlay stack, focus-trap, ARIA announcement)
  activates anyway, not only in the "direct trigger" path. This is an area where measured
  verification is needed (real DOM, not just reading the code), because the visible effect and the
  effect on the accessibility tree can diverge in non-intuitive ways.
- **Focus return on close**: a stable reference must be captured to the element that had focus
  *before* opening, updated only while the overlay is closed — not deduced inside an effect that runs
  on opening, because the order of effect execution (children before parent) can make a node already
  inside the overlay itself be read as the "element with focus". Two known limits to be declared
  explicitly: an opener that is disabled at the time of return cannot receive focus; an opener
  unmounted in the meantime cannot either.
- **Leak of non-DOM properties onto the DOM**: when a "control state" object is passed with a direct
  spread to a DOM element or to a component that spreads onto the DOM, every property not valid as an
  HTML attribute generates a warning and is visible in the markup anyway. The clean protection is to
  make those properties non-enumerable (so the spread skips them but they stay explicitly readable) —
  it must be tested with a dedicated "no leak" assertion, because a unit test that verifies only the
  functional behaviour can pass anyway.
- **A conditional spread in JSX bypasses TypeScript's "excess property" check**: a pattern such as a
  conditional spread of an optional prop onto a component that does not declare it is silently
  discarded at runtime, with `tsc` green. Direct assignment of the prop (declared optional in the
  type) is to be preferred over the conditional spread when the target is a component (it is fine on
  native HTML elements, where every attribute is legitimate).
- **Dialog sizes/variants** (size scale, like `sm/md/lg/xl`) and "type-to-confirm" variants for
  destructive actions are natural extensions, moderate difficulty.

### 1.7 Base primitives: Typography, Button, Icon scale, Input, Message Strip — **difficulty: low-medium**

Shared typographic scale (including a dedicated "monospace" token for codes/identifiers, not applied
by hand everywhere), consistent icon scale (xs→xl with declared steps), button variants
(`inline`/`icon-xs` size for compact uses inside text or cells), **Message Strip** (error/success/info
banner, the same generic concept as an inline "alert") with a single shared under-field message
mechanism for all form controls (same spacing/text size for error and for help text).

**Known pitfall**: two "functionally identical" buttons (e.g. two "Clear selection" in different
places of the screen) with the same accessible name but different effects must be distinguished by
name, otherwise they are indistinguishable for a screen reader.

### 1.8 Dialog with an embedded grid (Picker/Assignment dialog) — **difficulty: high**

A dialog that embeds a miniature List Report to choose/assign records (e.g. "move items", N:M
assignment). It combines all the pitfalls of §1.1 and §1.6, plus: horizontal containment of the
content within the dialog's limits (the content must scroll *inside* the dialog, not make it
overflow), stable footprint between the loading state and the state with data (otherwise the dialog
visibly "widens" as soon as the data arrives).

### 1.9 Soft-delete / Archive and restore — **difficulty: medium**

Cross-cutting pattern: replace physical deletion with an "archived" state, with a filterable view of
the archived records and a restore action. It implies reviewing every "usage/references" check that
previously blocked deletion (with soft-delete it is often no longer needed, since the record stays
and the references remain valid) and handling the "in flight" state of the restore (e.g. reduced
opacity + `aria-disabled` until the operation is confirmed by the server).

### 1.10 Real responsive on tablet/mobile, not a blocking gate — **difficulty: medium, high product decision**

**Maintainer decision (2026-10-25), replaces the previous version of this section** (which proposed
an "unsupported below a width threshold" gate for a desktop-first product with a minority of mobile
users): tablet and mobile must be truly supported, not blocked with a message. The concrete point
cited explicitly: **the space of the virtual keyboard** when a field gets focus — a Field, a Dialog
or a Sheet must not leave the active field hidden under the keyboard (handling based on
`visualViewport`/`dvh` units is needed, not just media queries on the static width).

Chosen approach: the keyboard-safe behaviour is **not deferred to a final ticket** for the structural
primitives (Field, Dialog, Sheet) — a retrofit on those components would cost a rewrite, not a
patch. It is instead part of the acceptance criteria of the tickets that introduce them, from the
moment they are born. Visual regression (§1.11, ticket #4) covers several viewports
(mobile/tablet/desktop) from its introduction, not just desktop. A resolution gate remains a
legitimate option in the future for very specific patterns where responsive would make no sense
(e.g. a List Report with a many-column table on a narrow screen), but it is no longer the default for
the project as a whole.

### 1.11 Technical governance of the package (CI/quality) — **difficulty: medium, but high leverage**

- **Per-import bundle size budget** (not only total package weight): warns when a single import
  exceeds a declared threshold, compared with a versioned baseline (not rewritten on every run,
  otherwise the gate measures nothing).
- **Visual regression** (Storybook + screenshot diff) for the high-blast-radius primitives: a
  functional E2E (click, focus, expected value) is **blind to layout** — title present, button
  clickable, selection correct can all be green even with wrong centring, double scroll or a clipped
  focus ring. A dedicated test category with real geometric assertions is needed
  (`getBoundingClientRect`/`getComputedStyle`: a single scroller, no horizontal overflow, enough
  space for the focus ring).
- **Mandatory changeset versioning**, with a CI check that looks at the files actually touched by the
  PR (not the global state of the repo).
- **Release sequencing for primitives**: a cause (e.g. a layout change of the primitive) and its
  companion fix (in a consumer that relies on that behaviour) must be released in the same release
  when they are coupled — a "breaking" primitive published without the companion fix creates a
  "poisoned" version window that consumers can install by mistake.
- **Targeted mutation testing on the engines** (diff, parsing, validation, equality): a manual round
  during code review of every PR that touches their logic, without additional dependencies (§1.13.2).

### 1.12 Free completion primitives (gaps compared with general-purpose open source libraries) — **difficulty: low-medium, DatePicker medium-high**

**Maintainer decision (2026-11-03).** Compared with general-purpose open source React component
libraries, some primitives that a consumer expects to find in any DS are missing. They are all
**Free** (§3): standard, widely available elsewhere, needed for adoption. Each is an independent
ticket, developable in its own branch/worktree (only exception: DatePicker depends on Calendar).

Anti-duplicate check on the existing code (2026-11-03) — none exists already as an exported
primitive, but some have an internal relative to keep in mind:

| Component | Existing overlap | Outcome |
|---|---|---|
| **Toast / notification** | `MessageStrip` is a persistent *inline* message, neither transient nor portalled | new primitive |
| **Tabs** | `ObjectPageAnchorBar` is anchored navigation with scroll-spy (links to always-mounted sections), not alternative panels | new primitive |
| **Accordion / Collapse** | none (the Object Page sections are not collapsible) | new primitive |
| **Avatar** | none | new primitive |
| **Breadcrumb** | none | new primitive |
| **Pagination** | cited in §1.1 as a List Report variant but **never implemented** | new standalone primitive; integration in the List Report is a separate future ticket |
| **Progress bar** | none | new primitive |
| **Skeleton** | `SkeletonRows`/`skeletonBarClass` internal to `ListReportTable` (not exported) | new primitive; migrating the table onto the primitive is out of scope (it would avoid churn of the visual baselines) |
| **Spinner** | none | new primitive |
| **Checkbox** | none (`Input` is text-only) | new primitive, integrated with `Field` |
| **RadioGroup** | the pills of `ListReportFilterBar` are a domain segmented `radiogroup`, not a form control | new primitive, integrated with `Field` |
| **Switch** | none | new primitive, integrated with `Field` |
| **Card** | none | new primitive |
| **Divider** | none | new primitive |
| **Menu / Dropdown** | none; it is the basis of the overflow menu cited in §1.1/§1.4 | new primitive |
| **Calendar** | none (the showcase uses a native `<Input type="date">`) | new primitive |
| **DatePicker** | same | new primitive, **depends on Calendar** |
| Generic badge | already covered by `StatusBadge` (#86) and by the count pill of the List Report (#82) | **discarded**, not a gap |

**Pitfalls of a general class to bring into the tickets** (besides those of §1.6/§1.7 that apply to
every primitive):
- Boolean/choice controls (Checkbox, RadioGroup, Switch) must go through the same `Field` wiring as
  the other controls (`useFieldControlProps`: `aria-describedby`, `aria-invalid`, forced/locked
  states **non-interactive even from the keyboard and from a click on the label**) and must not
  generate an echo `onChange` when the value changes from outside (§1.4).
- New overlays (Menu/Dropdown, DatePicker popover) rely on `overlayLayer`: no literal z-indexes,
  focus return to the trigger, correct even inside Dialog/Sheet. The Toast is the first *non-modal
  overlay that persists while the user works*: its level in the z-index scale must be decided
  explicitly (and a Toast must never steal focus).
- A Menu item must inherit `onClick`/`disabled` from what it represents (pitfall of §1.1).
- Announcements: Toast and Progress/Spinner announce through a live region that is **already
  mounted** (a region created together with the message is not read), without repeating the same
  announcement on every render.
- Motion (Toast, Accordion, Spinner, Skeleton) declared as a token and disabled with
  `prefers-reduced-motion` (the "Motion" rule of CLAUDE.md).
- Stable footprint: Skeleton/Avatar (fallback → loaded image), Pagination (change in the number of
  pages) and Tabs (panel change) must not produce avoidable layout jumps.
- Checkbox, RadioGroup, Switch, Calendar and DatePicker respect the **Absent-values rule** (§1.13.1:
  declared empty value, no echo conversion); Calendar and DatePicker are bound by **Locale and i18n**
  (§1.13.3); all use logical CSS properties (**RTL**, §1.13.4), with no RTL guarantee; the Menu
  typeahead follows **IME composition** (§1.13.5).

**Future note — Advanced Toast (Pro), not planned.** The same scheme already used for List Report and
Object Page (Free base, Pro advanced extension): the Free Toast covers the single accessible
transient message; a possible Pro **advanced Toast** would add a multi-toast queue with priority and
a limit on visible ones, timer pause on hover/focus and on an inactive window, persistence across
navigations/reloads, analytics hooks (shown/closed/action). No ticket until the maintainer asks for
it explicitly; the Free Toast must be designed so that this extension does not require breaking its
API.

### 1.13 Cross-cutting robustness rules — **difficulty: low to apply, high to retrofit**

**Maintainer decision (2026-11-03).** Five rules that apply to several components, each with a
citable name. Tickets recall them **by name** in their acceptance criteria
and code review verifies them. The sections of the individual components refer here instead
of repeating them (one source, no copied text that then diverges).

#### 1.13.1 Absent-values rule

**Problem.** `''`, `null`, `undefined` and, inside an object, the missing key are different
representations of "no value". If every module decides on its own when they are "the same thing",
false dirty states, ghost entries in the Change Summary and payloads different from the expected ones
are born.

**Level 1, identity of the data (default everywhere).** The four states are **distinct**: `''` ≠
`null` ≠ `undefined`, and a key with value `undefined` ≠ a missing key. This is how they count: the
form state, `isDirty` (`deepEqual` in `packages/core/src/object-page/equal.ts`, rule written in its
TSDoc), the validation schemas (§1.5) and the payload to the API. Reason: on the wire they really
are different (in JSON `undefined` makes the key disappear, `null` stays, `''` is a string) and a
backend can legitimately distinguish "emptied" from "not sent".

**Level 2, intended collapses (presentation only, closed list).**
1. **List Report sorting**: `toSortKey` in `packages/core/src/list-report/compare.ts` treats
   `null`/`undefined`/`''` (plus `NaN` and an invalid `Date`) as "empty", always at the bottom. It is
   a display criterion, not a statement that the values are equal.
2. **Rendering of a control**: showing an absent value as empty text (`value ?? ''`) is legitimate
   **when reading**; it must never become a write into the state (it would be an echo, §1.4).
3. **Compact rendering of the Change Summary** (level 0 of `<ChangeSummary />`, entry added on
   2026-11-05 by maintainer decision, #202): `null`, `undefined` and a missing key all read
   `No value`. It is text only; `ChangeEntry` keeps the distinction (`before`/`after`,
   `beforeMissing`/`afterMissing`) and the precise rendering (level ≥ 1) uses distinct texts.
4. **Custom `renderValue` that delegates to `formatChangeValue`** (entry added on 2026-11-05 by
   maintainer decision, #202): `renderValue` receives a missing key as `undefined` and, in a
   `changed` from a present `undefined` to a missing key, the two calls have identical arguments, so
   the delegation does not distinguish the two states and renders `from Undefined to Undefined` (with
   `precise: true`; in compact form `from No value to No value`). Accepted behaviour, not a defect:
   the component's default rendering distinguishes them and the data in `ChangeEntry` stays correct.
   A third argument of `renderValue` is not planned.

Any other collapse is a bug, until it is added to this list with a date and a reason.

**Change Summary: no longer an allowed collapse (maintainer decision of 2026-11-03, fix in #202).**
The engine of #174 (`packages/pro/src/change-summary/compute-change-summary.ts`) collapsed values
into the classes **Absent** (`undefined`, `null`, missing key) and **Empty** (Absent ∪ `''` ∪ `[]` ∪
a plain object with only Empty values) and generated no entry between two Empty sides; it was point
2 of this list. Since #202 it follows **Level 1** like `isDirty`: invariant "no entry ⇔ `isDirty
=== false`" (without a custom `isEqual` and without `arrayIdKeys`: declaring an `idKey` leaves two
intended differences, the reorder without edits, which is dirty but gives no entry, and the elements
whose id is not matched by `Object.is`. The reorder, since #424, is listed in `reorders` of
`computeChangeSummaryResult`/`useChangeSummary`, so "no entry and no reorder ⇔ `isDirty === false`"
holds also with `arrayIdKeys`, except for unmatched ids. These give `added` + `removed` even on equal
arrays: elements without an id, object ids compared by reference (a cloned `Date` or object is
another id), `0` against `-0`). Readability ("from (empty) to (empty)") is solved in the
**rendering**: `ChangeEntry` has `beforeMissing`/`afterMissing` to distinguish the missing key from
`undefined`, and the component uses distinct texts in the precise rendering (`nullValue`,
`undefinedValue`, `missingValue` in `ChangeSummaryValueLabels`, defaults `Null`, `Undefined`,
`Missing`); the compact rendering stays `No value`. Rule in the TSDoc "No value rule" of
`change-summary/types.ts`.

**Divergence "form dirty with an empty Change Summary": no longer accepted, resolved by #202.** It
was the consequence of the old collapse. Concrete cases: baseline `{ note: null }`, the user types
and then deletes in an `Input` (which emits `''`); a `Combobox` with `clearOnEmpty` that emits
`undefined` on a `null` baseline. In both cases the form is dirty **and** the summary shows the
entry. It remains valid, as good practice and no longer as a remedy for a defect, to build the
baseline with the same representation of "empty" that the control emits (normalizing at the
hydration/schema boundary), so that emptying an already empty field does not make the form dirty.

**Contract for every form control**, new or touched (Input, Select, Combobox, Checkbox #188,
RadioGroup #189, Switch #190, Calendar #194, DatePicker #195, Zod tickets):
- The TSDoc declares the **empty value emitted when the user empties it**. Existing: `Input` → `''`;
  `Select`/`Combobox` → `undefined` (`'value' in props` distinguishes "controlled and empty" from
  "uncontrolled"); `MultiSelect`/`FileUpload` → `[]` (list-valued exception, §1.13.1). New selection
  controls → `undefined`, consistent with Select/Combobox, unless decided otherwise (§5 point 7).
  Checkbox/Switch always emit a boolean; "indeterminate" is a separate prop, never `null` as a value.
  **Exception decided by the maintainer (2026-11-08, FileUpload/MultiSelect ticket):** a control
  whose value is intrinsically a list (multiple selection, attachments) emits `[]` when empty, not
  `undefined` — an empty array is the most natural representation for a consumer that iterates over
  the value, and it is still a single distinct "empty" state (no ambiguity with `undefined`/`null`,
  which stay "uncontrolled"/"no external value" for those controls). It applies only to list-valued
  controls, it does not change the default for the single-valued controls above.
- An absent incoming value (`null` included) is shown as empty **without** any
  `onChange`/`onValueChange` that converts it into another representation of absent (echo, §1.4).
- Mandatory tests: input matrix {`undefined`, `null`, `''` where the type allows it, missing
  prop/key} × {at mount, changed after mount} → zero callbacks; emptying by the user → exactly the
  declared empty value.
- Zod schema: no implicit coercion. `.nullable()`/`.optional()` are explicit; a `preprocess`
  `'' → null` is declared in the schema and tested; a missing required field fails loudly (§1.5).

#### 1.13.2 Targeted mutation testing on the engines

**Problem.** On pure-logic modules (diff, parsing, validation, equality, sorting) a green and
"exhaustive" suite can pass anyway with an inverted comparison or a removed guard: it is the point
where a defect costs most and shows least. A test that does not fail when the code is wrong protects
nothing. So far this was done only at a reviewer's initiative (#174).

**Rule.** Every PR that adds or modifies the logic of an **engine** goes through a round of **manual,
targeted** mutation testing, done during code review (procedure in
the code review guidelines): mutate by hand the conditions and comparisons introduced
or touched by the diff, one mutation at a time, and verify that at least one existing test fails. A
surviving, non-equivalent mutation counts as a missing test: PR rejected.

**Scope.** Engines today are: `object-page/equal.ts`, `object-page/field-errors.ts`,
`object-page/keep-edits.ts` (the field-by-field rule of `save` with edits during the save, #545:
guards on the shape of arrays, `hasOwn` on `sent`/`current`, return of `returned` with equal content,
comparison with `deepEqual` and never with `isEqual`), `list-report/compare.ts`, the
sorting/filter/search-commit logic in `list-report/use-list-report.ts`, the parsing in
`list-report/use-list-report-url-state.ts` and `use-list-report-scroll-restoration.ts`,
`combobox/filter.ts` with `internal/normalize-text.ts`, the state machine of
`combobox/use-combobox.ts`, `internal/keyboard-navigation.ts` and, in Pro,
`change-summary/{compute-change-summary,infer-label,format-change-value}.ts`. Coming: 
`calendar/date-math.ts` (#194), `date-picker/date-format.ts` (#195), the Zod schemas. **Excluded**:
presentation-only components, style files, stories. The rule applies to diffs, not to a retroactive
campaign on already merged modules.

**Why manual and not Stryker (decision 2026-11-03).** An automatic tool (Stryker with a Vitest
runner) would add a heavy development dependency and run the file's suite for every mutant: on
engines with parametric matrices (the 36 cases of #174) that is minutes per file, a fixed cost on
every PR on a shared CI with the already known hardware constraint, plus much noise from equivalent
mutants on defensive code. The mutations that matter are few and predictable (boundaries, comparison
operators, guards, swapped sides) and code review reads the diff line by line anyway. To be reviewed
if a defect that reached `main` proves catchable by a mutation that the manual round had skipped, or
when the engines become too many for a manual round per PR.

#### 1.13.3 Locale and i18n

**Decision of 2026-11-03, binding for #194 (Calendar), #195 (DatePicker) and for every component that
formats dates, numbers or internal texts.** Principle: start simple, evolve if needed.

- **No i18n or date library in the bundle** (neither core nor Pro): formatting uses native `Intl`
  (`DateTimeFormat`, `NumberFormat`, `Collator`, `Locale`). Reason: the per-import budget (§1.11),
  and `Intl` already covers what is needed. An invalid locale or time zone degrades to the runtime
  defaults without exceptions (precedent: `change-summary/format-change-value.ts`).
- **Locale resolution**: the component's `locale` prop → (in the future) a core context provider →
  runtime default (`undefined` is passed to `Intl`, which in the browser is equivalent to the user's
  language). The library never reads `navigator.language` directly: `undefined` gives the same result
  in the browser and works on the server without guards on `navigator`. It is the same default
  already in use in `useListReport({ locale })` and in `ChangeSummary` (`locale`, `timeZone`). The
  provider is not introduced now: components go through a single internal resolution helper, so
  adding it later does not break the API.
- **SSR, declared risk**: on the server the default is the process locale (often `en-US`), on the
  client the browser's. Without an explicit `locale` the formatted text may differ and React reports
  a hydration mismatch (with a client re-render of the subtree). Contract: whoever does SSR passes
  `locale` and, where needed, `timeZone` and `today`. Every localized component has a
  `renderToString` + `hydrateRoot` test with an explicit locale, without hydration errors. Stories,
  e2e and visual baselines always pass a fixed locale.
- **Date values**: ISO string `YYYY-MM-DD` (type `IsoDate`), independent of the display locale. Never
  `Date` as a value: it represents an instant and shifts by a day across time zones and daylight
  saving time. Arithmetic is done on `Date.UTC`. The locale affects only display and the parsing of
  typed text. If `locale` changes after mount, the text is reformatted without `onValueChange` (echo,
  §1.4).
- **First day of the week**, in order: (1) the `weekStartsOn` prop; (2)
  `Intl.Locale(locale).getWeekInfo()` or the `weekInfo` accessor where it exists (not in all
  engines); (3) a small internal table by region (`Intl.Locale(locale).maximize().region`) derived
  from CLDR `weekData.firstDay`, a few dozen codes and a few hundred bytes; (4) Monday (ISO 8601).
  Reason for the table: with only "Sunday for `en-US`, Monday for the others", `ja-JP`, `pt-BR`,
  `en-CA` (Sunday) or `ar-EG` (Saturday) would be wrong and, above all, the result would change
  between a browser with `weekInfo` and one without: two different visual baselines for the same
  locale.
- **Internal texts of the library** ("Previous month", "Clear", "Choose date", ...): English defaults.
  A new component with two or more internal texts, or with texts that contain values, exposes
  `labels?: Partial<XLabels>` with the type `XLabels` exported and merged with the defaults. Texts
  with a value are functions (`chooseDateSelected: (date: string) => string`), not placeholders in a
  string: no ICU format; plurals only with functions (precedent: `items` in
  `format-change-value.ts`). The existing single `*Label` props (`emptyLabel`, `dismissLabel`,
  `searchLabel`, ...) stay: no retroactive migration. Declared exception: `ChangeSummary` uses
  `valueLabels` because `labels` is already taken by the path labels of `useChangeSummary`.

#### 1.13.4 RTL: not guaranteed for now, door left open at low cost

**Decision of 2026-11-03.** Right-to-left layout is **neither supported nor guaranteed**: it is a
conscious choice, not an oversight. No tests, no RTL visual baselines, no promise in the
documentation. To keep the cost of a future recovery low, new or touched components use **logical
properties**: `margin-inline`, `padding-inline`, `inset-inline-start/end`, `text-align: start` and,
with Tailwind v4 (the stack in use), the utilities
`ms-/me-/ps-/pe-/start-/end-/text-start/text-end`, not `ml-/mr-/pl-/pr-/left-/right-/text-left`.
The existing code is already almost entirely logical (listbox, Field, Select, Description List, List
Report); the physical exceptions counted on 2026-11-03 are `StatusBadge` and the close button of
`MessageStrip`, to be converted only when those files are touched for other reasons.

**What logical CSS alone does NOT cover** (to know at recovery time, so the estimate stays honest):
- directional icons (previous/next month chevrons, Breadcrumb separator, Pagination arrows);
- **left/right arrow keys** in custom keyboard navigation (Calendar, Tabs, Menu): the computed
  `direction` must be read, as `isRtl` already does in `ListReportFilterBar.tsx`;
- translations and entry animations (`--rop-modal-from-translate` and the Sheet's `box-shadow`
  offset);
- APIs with physical sides (`side: 'left' | 'right'` of Sheet and Tooltip);
- `scrollLeft`, which in RTL is negative in modern browsers: today the parsing of the position in
  `use-list-report-scroll-restoration.ts` discards negative values;
- bidi isolation of user values inside composed text (`<bdi>` / `unicode-bidi: isolate`, e.g.
  "from X to Y" in the Change Summary);
- the direction provider of the Radix primitives.

The already existing RTL behaviour (reversed arrows in the Filter Bar pills) stays as it is, with its
tests, but is not a product guarantee. The same holds for a new component that decides to handle
`direction` at almost no cost (e.g. the Calendar arrows): allowed, without dedicated RTL visual
baselines.

#### 1.13.5 IME composition in search and filter

Same family as the race on fast typing (§1.5). During an IME composition (CJK input, between
`compositionstart` and `compositionend`, or a keydown with `isComposing` / `keyCode === 229`) the text
in the input is provisional: candidates not yet confirmed, kana not yet converted. Rules for every
control with a search or filter triggered by typing:
- **During composition** no asynchronous search and no delayed commit starts (debounce, URL
  synchronization, "confirmed query" callback). A synchronous local filter may follow the text: it
  is cheap and reversible.
- **At `compositionend`** the final text counts as a single change, from which debounce or search
  start. It must be read from `event.currentTarget.value` in the handler itself, without relying on a
  later `onChange`: the order of `input`/`compositionend` varies between engines.
- **Enter, Escape, arrows and Tab during composition belong to the IME**: no selection, closing or
  commit. The keydown with `keyCode 229` that Safari sends after `compositionend` is also ignored.
  If focus leaves during composition, the composition state is reset. Correct precedent:
  `onKeyDown`/`onBlur` of `combobox/use-combobox.ts`.
- **Tests**: unit with `compositionStart` → `change`... → `compositionEnd`: zero searches and commits
  during the composition, exactly one afterwards, with the final text; Enter with `isComposing` does
  not select. In Chromium e2e, CDP `Input.imeSetComposition` can be used where needed.
- **Applies to**: Combobox with asynchronous search (Pro, §3; the synchronous Free Combobox already
  ignores keys during composition, but `onInputValueChange` also fires on the provisional text: the
  asynchronous contract cannot rely on it as it stands), Menu typeahead (#193), the
  `ListReportFilterBar` search (**latent defect counted on 2026-11-03**: Enter during composition is
  already ignored, but `setSearchDraft` in `use-list-report.ts` starts the 300 ms delayed commit on
  every `change`, so a pause on choosing the candidate confirms the search with the provisional text,
  updates URL and rows and then repeats everything with the converted text; no ticket open).

---

## 2. Proposed architecture

### 2.1 Primary architectural reference

**List Report and Object Page as generic enterprise composition patterns** (see §0) as the reference
for composition and high-level naming. The new design system presents itself, in part, as: *"an
independent, open-source, headless React implementation of the List Report / Object Page patterns —
for those who want that enterprise UX without a proprietary framework"*. No third-party asset, CSS or
code is touched: only the generic interaction pattern.

### 2.2 Technical stack

- **React 18/19 + TypeScript**, **headless** pattern (logic/state separate from style) already
  successfully validated in react-virtual-tree-view and react-virtual-dnd-table.
- **Build**: tsup (consistent with the maintainer's existing projects).
- **Storybook** as development/demo/documentation environment, with **visual regression** active from
  the first component (not added afterwards as a dead scaffold, a lesson learned from earlier
  material: a visual regression existing only as an orphan script protects nothing).
- **Vitest** for unit tests, **Playwright** for e2e (including real touch tests via CDP where needed,
  a pattern already used on react-virtual-tree-view).
- **Zod** for schemas (direct reuse of the FE↔data "contract check" pattern).
- **TanStack Query** for the data layer (cache, invalidation, in-place update).
- **Changesets** for versioning/release, as already done on the other public packages.

### 2.3 Monorepo structure

```
packages/
  core/        # MIT, free, on public npm
  pro/         # commercial licence, separate package
  docs/        # public Storybook (core) + separate/gated Pro area
```

**Core (MIT)**: base primitives (§1.7), "simple" Dialog/Select/Tooltip/Sheet (§1.6 without the
advanced extensions), simple List Report (client-side, without heavy virtualization), simple Object
Page (sections + save-bar, without advanced Change Summary), Message Strip, Description List, basic
data layer (schema+hook).

**Pro (paid)**: everything that in §3 turns out to be a "real moat" — virtualization on List
Report/Object Page for large datasets, Picker/Assignment dialog with an embedded grid, advanced
Change Summary with smart diff, BulkActionsBar with advanced variants, robust dirty-tracking on
complex forms with asynchronous hydration, soft-delete/archive-restore as a ready-to-use pattern (not
only the UI of the single component, but the whole flow), possibly an advanced variant based on the
already existing packages react-virtual-tree-view/react-virtual-dnd-table (see §4).

### 2.4 Pro licensing and distribution

Three options, to be decided (see §5):

1. **Registry with access reserved to buyers** (originally "paid private npm org"; option superseded
   on 2026-11-26, see below): simple to implement, but ties access to the customer's account: manual
   management of access/revocations is needed. **Current choice: GitHub Packages**.
2. **Licence with a key (licence key) verified at build time**: the Pro package can also be published
   on a public registry but requires a valid key to build/start (checked against a small, even
   minimal, licence service). More initial work, but a more standard model for a "Pro component
   library" (it is what most Pro design systems on the React market use, e.g. commercial table/admin
   libraries).
3. **Pro package as "source-available" code downloadable after payment** (no public npm, distribution
   via link/zip + private repo with access granted on purchase): minimal infrastructure effort, less
   professional, less suited to continuous updates.

**Preliminary recommendation**: start with option 1 (registry with reserved access; then thought of
as a private npm org, superseded on 2026-11-26) for the MVP: it is the minimum effort to validate
that someone is willing to pay, before investing in a more sophisticated licensing system (option 2)
when volumes justify it.

**Update 2026-11-13**: the maintainer did not change this choice. Option 1 (at the time "private npm
org", superseded on 2026-11-26; no runtime licensing) remained the recommendation, compatible with the
per-developer one-time-payment licence, with 12 months of updates included, sold through a Merchant
of Record (§8).

**Maintainer decision, 2026-11-26 (current choice)**: the Pro is distributed through **GitHub
Packages**, under a **dedicated (free) GitHub organization**, no longer through a private npm org.
Reason: on npm private packages require a paid monthly plan per user, and the project avoids
recurring fixed costs; GitHub Packages is free within the storage and traffic limits of the free
plan. Unchanged: no runtime licensing and no key (verified by `packages/pro/test/dist.smoke.test.ts`).
`packages/pro` stays `"private": true` until the package is published on GitHub Packages
(configuration and publication: ticket #693).
- **Scope**: on GitHub Packages the npm scope must match the owner, and the name `formrail` on GitHub
  is already taken by an existing organization (inactive, not ours), so the scope `@formrail` cannot
  be used there. Maintainer decision of 2026-11-26 (option a): the free org **`formrail-dev`** has existed since 2026-11-26 (created
  by the maintainer: Free plan, base permissions "No permission"), published package
  **`@formrail-dev/pro`**.
- **Installation**: buyers use an npm alias, for example
  `"@formrail/pro": "npm:@formrail-dev/pro@^0.2.0"`, so imports stay `@formrail/pro` and the registry
  configuration does not touch the public `@formrail` scope of the core.
- Alternatives set aside: a package under the maintainer's personal account; asking GitHub for the
  inactive name `formrail` (uncertain outcome and timing); paid npm (fixed cost).

---

## 3. Free vs Pro segmentation

Explicit criterion: **Pro if it has a real technical moat and/or a high engineering cost (hard to
clone with a prompt in a weekend)**; **Free if it is relatively standard** (needed for
adoption/community, low difficulty or widely available in other open source libraries).

| Component/pattern | Free | Pro | Rationale |
|---|---|---|---|
| Typography, Button, Icon scale, Message Strip | ✅ | | Standard, low difficulty, needed for adoption |
| "Simple" Input/Select/Combobox (sync, no async search) | ✅ | | Common pattern, widely available elsewhere |
| Basic Dialog/Sheet/Tooltip (size, basic focus-trap) | ✅ | | Radix equivalents already exist for free elsewhere: the value is in the consistent integration, not in the isolated primitive |
| Description List (inline/stacked) | ✅ | | Medium difficulty, but a "showcase" component to show the quality of the DS and attract adoption |
| Simple client-side List Report (no virtualization) | ✅ | | Good as a showcase, but without the hard part |
| Basic Object Page (sections + simple save-bar) | ✅ | | Same: shows the pattern, without the advanced dirty-tracking |
| Completion primitives (§1.12): single Toast, Tabs, Accordion, Avatar, Breadcrumb, standalone Pagination, Progress bar, Skeleton, Spinner, Checkbox, RadioGroup, Switch, Card, Divider, Menu/Dropdown, Calendar, DatePicker | ✅ | | Expected in any DS, widely available elsewhere: needed for adoption (maintainer decision of 2026-11-03) |
| AppShell (shell, launcher, app switcher) | ✅ | | Standard pattern, free in many general-purpose open source libraries, low difficulty compared with the Pro engines and composed of already existing Free primitives (Menu, Sheet, Skeleton, Avatar); it does not strengthen the Pro positioning (§8, integrity of record editing). Search among apps, favourites and recents remain a possible future extension (#636, #639) |
| Advanced Toast (multi-toast queue, pause on hover/focus, persistence, analytics) | | ✅ (future note, not planned) | Same Free base / Pro advanced scheme as List Report and Object Page; see §1.12 |
| **Virtualized List Report for large datasets** | | ✅ | Virtualization + consistent scroll/selection/drag is high engineering work, a real moat (already proven on react-virtual-tree-view/dnd-table) |
| **Robust dirty-tracking with asynchronous hydration** (no "echo" on an external value, no false dirty) | | ✅ | A subtle and recurring pitfall (§1.4), solving it well is years of experience concentrated, hard to replicate on the fly |
| **Advanced Change Summary** (reliable per-field diff on nested data/arrays) | | ✅ | Non-trivial logic, high perceived value for enterprise customers |
| **Picker/Assignment dialog with an embedded grid** | | ✅ | Combines all the pitfalls of overlay+grid, a notoriously fragile component (§1.8) |
| **Advanced BulkActionsBar** (embedded/static variants, focus handling on selection reset consistent with multi-level Escape) | | ✅ | Non-trivial cross-level event/focus handling |
| **Soft-delete/Archive-Restore as a ready-made pattern** (not only UI, but hook+state+data contract) | | ✅ | It is a whole application flow, not a widget — high value, high difficulty |
| **Production-grade asynchronous-search Combobox** (race condition on fast typing, out-of-catalogue value) | | ✅ | Subtle class of bugs already documented, a moat from direct experience |
| CI governance (bundle budget, visual regression, changeset gate) | ✅ (template) | ✅ (managed/pre-configured) | The template is useful for free for adoption; a "ready-to-use and maintained" version is a Pro service |

---

## 4. Reuse with the maintainer's existing projects

- **An internal approval application (invoice-approval workflow)**: it uses "custom" tables/forms for
  the approval; its approval UI is conceptually an **Object Page** (invoice = object, sections =
  invoice data/supplier/approval history, actions = approve/reject) with a **List Report** for the
  queue of invoices to approve. Migrating it onto the new DS is not just internal reuse: it is the
  **first real test bed** for the DS (if it does not hold up here, it holds up nowhere).
- **react-virtual-tree-view / react-virtual-dnd-table**: natural candidates as the **foundation of
  the Pro "advanced tables" level** (virtualization + drag&drop already mature, tested, with initial
  community/traction) instead of remaining separate satellite packages. To be **discussed, not
  decided**: keep them standalone (they keep a life of their own, citable as "also used inside the Pro
  DS") vs. absorb them as an internal dependency of the Pro package. The first option preserves their
  already built visibility/community; the second simplifies maintenance. Probably the right answer
  is "both": they stay standalone public packages, and the Pro DS uses them as a dependency (same
  principle as headless libraries that compose reusable pieces).
- **Other internal dashboards** (lists of leads/trades, detail panels): a good second/third test bed
  for the Free DS (list + preview, without needing the Pro features), useful to validate that the Free
  holds up on its own in real cases before pushing on the Pro.

---

## 5. Risks and open questions for the maintainer

1. **Project/package name**: decided, **Formrail** (packages `@formrail/core` and `@formrail/pro`,
   repo `Utumno1984/formrail`; maintainer decision of 2026-11-11, ticket #428). Previous name, for the
   record: `react-object-page` (consistent with the `react-virtual-*` naming already used by the
   maintainer), replaced by the rebrand.
2. **Pro licensing mechanism**: reserved registry (minimum effort, less standard) vs licence key (more
   market-standard, more initial effort) vs paid source-available. Preliminary recommendation in
   §2.4: start simple (at the time a private npm org, superseded on 2026-11-26: today GitHub
   Packages), evolve if there is traction.
3. **Positioning: decided neutral, no reference to third-party products/brands** (2026-10-30, revision
   of the initial choice). The project presents itself only as an independent headless React
   implementation of generic enterprise UI patterns (List Report, Object Page), without naming or
   evoking any specific commercial product — neither in the name, nor in the README, nor in the public
   documentation. Reason: avoid any surface that could be read as a connection with a specific
   third-party product, beyond what is strictly necessary to describe generic, public-domain UI
   patterns.
4. **Recurring subscription vs perpetual licence for the Pro** (superseded on 2026-11-13, see the end
   of the point): in line with the stated aim of monetizing, a **recurring per-seat or per-project
   subscription** (typical of this market: many commercial React "admin template"/"Pro component"
   products sell a perpetual per-project licence with optional upgrades — but a subscription with
   continuous updates + support aligns better with the explicit wish for recurring revenue).
   **Decided on 2026-11-13** (takes the place of the recurring subscription of 2026-11-03): per-developer
   one-time-payment licence, with 12 months of updates included, through a Merchant of Record. At the
   end of the 12 months there is no automatic renewal; the versions received remain usable without
   time limit; to get later updates one buys again (maintainer decisions of 2026-11-26, text in
   `/license/`). See §8.
5. **Pro customer target**: freelancers/small React teams building enterprise backoffices/admins (the
   same implicit target as the known competitors in this space: Pro React admin-template/dashboard
   libraries). To be validated whether it is the same target as, or different from, the Free tier's
   (probable: Free attracts broad adoption/community, Pro converts those who really have a complex
   backoffice to build in production).
   **Decided on 2026-11-13**: the Pro target is **company teams** (ERP, business management
   software, administrative portals), not freelancers/small teams. See §8.
6. **Risk of diluted attention**: the maintainer already has 2 active public packages
   (react-virtual-tree-view, react-virtual-dnd-table) plus other products in progress. This is
   **one more front**. It must be decided consciously whether it has higher priority than completing
   the other products or proceeds in parallel at a slower pace (the MVP section below assumes a "slow
   but with a moat" pace, not a sprint).
7. **Absent values between form and Change Summary** (opened on 2026-11-03, see §1.13.1).
   (a) **Decided on 2026-11-03, resolved by #202.** `isDirty` (core) stays strict and unchanged
   (reflects the real payload; no change to the Free); it is the Change Summary (Pro) that aligns to
   Level 1, distinguishing `''`/`null`/`undefined`/missing key like `isDirty`. "Dirty but no change in
   the summary" remains possible only for the reorder declared with `idKey`. A possible
   absent-values equivalence option remains a matter for the future **robust Pro dirty-tracking**
   (§3), to be applied to form and summary together, never to only one of the two.
   (b) Empty value emitted by the selection controls: `undefined` like Select/Combobox today
   (recommended: consistency, with mapping to `null` in the schema if the backend wants it) or `null`
   as proposed by the default of #195. To be decided before the development of #195.

---

## 6. Proposal for a first MVP

Goal: quickly reach something that (a) the maintainer can already use in their own applications, (b)
is presentable publicly as an independent, open-source, headless React design system, (c) already has
a first sellable Pro component to validate the demand, without building everything else first.

**Proposed order:**

1. **Free — foundations**: Typography, Button, Icon scale, Message Strip, "simple" Input/Select,
   basic Dialog/Sheet/Tooltip. (They are the same bricks as any DS: necessary but low differential —
   do them well and fast, do not over-invest.)
2. **Free — simple List Report** (client-side, pill filters, configurable columns, stable
   empty/loading) + **simple Object Page** (anchored sections + basic save-bar). This is the first
   moment in which the project's positioning becomes visible and demonstrable in Storybook — it is
   worth investing here in visual quality and demos, it is the "business card".
3. **Validation on a real application**: migrate a real record queue + editor (an approval workflow)
   onto the Free List Report + Object Page. If real (not aesthetic) limits emerge here, it is the most
   honest signal of what is missing before selling anything.
4. **First Pro component**: **robust dirty-tracking + Change Summary** on the Object Page (§1.4, §3) —
   it is the pattern with the most subtle and documented pitfall in this spec (see §1.4), so the moat
   is real and verifiable, and it connects directly to the pain of any enterprise record editor (not
   only one specific case). Second Pro component right after: **virtualized List Report** for large
   datasets, directly reusing react-virtual-tree-view/react-virtual-dnd-table as the engine (see §4)
   — low development time because most of the work is already done and public.
5. **First sales channel**: reserved registry (§2.4 option 1) for the Pro package, landing page with a
   public Storybook demo of the Free + a "timed/watermarked" demo of the Pro, simple initial price
   (per-project, not per-seat, to lower the friction of the first purchase).
   **Superseded on 2026-11-13** for the pricing model (per-developer licence, not per project) and
   for the order: first the landing page with a waiting list/pre-order, then sales.
   **Channel superseded on 2026-11-26**: no longer a "private npm org" but GitHub Packages (§2.4, §8).
   The "timed/watermarked demo" of the Pro is neither confirmed nor superseded (not addressed). See
   §8.

**Do not do right away** (risk of over-engineering before validating): licence-key system,
soft-delete as a complete Pro pattern, Picker/Assignment dialog (it is notoriously the most fragile
component of this class, §1.8 — redoing it well requires having already consolidated
Dialog+Select+DataGrid, otherwise the same class of bugs is inherited from the start).

---

## 7. Pro Change Summary — API decisions (brainstorming, 2026-11-03)

First Pro component of the project (§6 point 4). Nothing exists yet: `useObjectPageForm` (Free)
already exposes `values`/`baseline`/`isDirty` (deep structural comparison), but no per-field diff. The
Change Summary consumes `values`/`baseline` as a separate hook — **no change to the existing Free
API**.

### Decisions taken (approved by the maintainer, 2026-11-03)

- **Two separate tickets for the implementation**: one for the engine/hook `useChangeSummary`
  (exhaustive unit tests on edge cases and equality rules — the three "no value" states, array
  identity, reorder without edits, label algorithm), one separate for the visual component
  `<ChangeSummary />`. Not a single monolithic ticket: the engine is the technical moat and must be
  validatable/testable in depth on its own, before and independently of the presentation.
- **The default `renderValue` handles booleans and dates well**, not just raw strings/numbers: a
  boolean must not appear as a literal "true"/"false", a date not as the raw output of
  `Date.prototype.toString()`. Implementation detail (exact format, locale) is for the ticket, but the
  component's acceptance criterion requires it explicitly from the first round, not as later polish.
- **Array diff: per element, with an `idKey` declared by the consumer** for each array field that
  needs it (e.g. invoice lines identified by `id`). An array without a declared `idKey` diffs "as a
  block" (whole old vs whole new), not per element — an explicit degradation, not a silent error.
- **Labels: automatic inference from the path** (`amount` → "Amount", camelCase/snake_case split and
  capitalized), **with an override map** for paths where inference is not enough (e.g. acronyms,
  domain terminology). No dependency on the not yet planned Zod work.
- **API shape: hook + component.** `useChangeSummary` is the engine (the real moat: structured diff,
  handles nesting/arrays/identity), `ChangeSummary` is an opinionated component that renders it
  readably by default but stays replaceable (same principle as Field/FieldMessage: reusable engine +
  ready-made presentation).
- **Sequence: start right away**, the Zod/validation-uniformity block (confirmed 2026-11-01, never
  planned) stays the next one after this, not a prerequisite.

### API sketch (to be refined in tickets, names not binding)

```ts
interface ChangeSummaryOptions<Values extends object> {
  values: Values;
  baseline: Values;
  /** Per-path array identity key, e.g. { 'lineItems': 'id' }. An array with no entry here diffs as
   *  a whole block (old vs new), not per-item — explicit degrade, not a silent one. */
  arrayIdKeys?: Record<string, string>;
  /** Override the auto-inferred label for specific paths, e.g. { 'supplier.vatNumber': 'VAT number' }. */
  labels?: Record<string, string>;
  /** Custom equality per path/value; falls back to the same deep structural comparison as `isDirty`. */
  isEqual?: (a: unknown, b: unknown, path: string) => boolean;
}

interface ChangeEntry {
  path: string;   // e.g. 'lineItems[2].price'
  label: string;  // auto-inferred or overridden, e.g. 'Line Items > Item 3 > Price'
  kind: 'added' | 'removed' | 'changed';
  before: unknown; // undefined when kind === 'added'
  after: unknown;  // undefined when kind === 'removed'
  beforeMissing: boolean; // no own key in the baseline, or no counterpart for an array item
  afterMissing: boolean;  // same, for values
}

function useChangeSummary<Values extends object>(
  options: ChangeSummaryOptions<Values>,
): { entries: ChangeEntry[]; isEmpty: boolean };

function ChangeSummary(props: {
  entries: ChangeEntry[];
  /** Per-value formatting hook (currency, custom domain types...); overrides the built-in default,
   *  which already renders booleans and dates sensibly (not `String(value)`), not just strings/numbers. */
  renderValue?: (value: unknown, entry: ChangeEntry) => ReactNode;
  emptyLabel?: string;
}): JSX.Element;
```

### Known technical risks to address in the tickets (not generic pitfalls, specific to this component)

- **Three distinct "no value" states** (empty string vs `undefined` vs `null`, a constraint already
  fixed in §1.4): #174 had collapsed them into the Absent/Empty classes (absent ↔ `''` without an
  entry); **the decision of 2026-11-03 reverses this** and #202 makes them distinct as in `isDirty`
  (Level 1, §1.13.1), with `beforeMissing`/`afterMissing` on `ChangeEntry` and distinct rendering in
  the component. The canonical rule is in §1.13.1.
- **Array identity**: an `id` present in the baseline but not in the `values` → `removed`; a new `id`
  in the `values` → `added`; same `id` with different content → `changed`, with one `ChangeEntry` for
  each field of the single changed element (not a single "row N changed" entry). **Reordering an
  array without changing its content must not generate any `ChangeEntry`** — it is the whole reason
  to prefer `idKey` over the positional diff, it must be tested explicitly (same identity set,
  different order → empty `entries`).
- **Label inference algorithm**: it must be fixed and tested deterministically (split on
  camelCase/`_`/`-` boundaries, capitalization, array segments rendered as "Item N" or similar)
  before writing the component, not improvised case by case.
- **Performance**: the diff must be recomputed with a `useMemo` kept stable on `values`/`baseline` by
  identity (the same pattern already used for `isDirty` in `useObjectPageForm`), not recomputed on
  every render by value.

---

## 8. Pro commercial plan — maintainer decisions (2026-11-13)

It comes from a critical review of the Pro plan with respect to sellability, done during planning
on 2026-11-13. The points that emerged are **planning assessments, not maintainer decisions**; the
maintainer shared the analysis and took the decisions listed below.
- The value of the Pro is concentrated in a few thousand lines of logic (about 3,600-4,100 non-test
  lines in `packages/pro/src`, depending on how they are counted), with public source and rules: a
  small team can rewrite it.
- The declared target (freelancers and small teams) is the one that pays least willingly.
- The Pro depends on the core, which has no users yet.
- Virtualization is a commons (TanStack Virtual, free DataGrids).
- A subscription without runtime licensing buys only updates.
- The "to be defined" licence does not even allow a trial.
- The demand has not been validated (§6 points 3 and 5 not done).

These decisions replace the corresponding parts of §2.4, §5 (points 4 and 5) and §6 (point 5).

### Decisions taken

1. **Validation before sales.** The tickets in progress do not stop: the core is close to v0.1.0 and
   the Pro demo is being completed. The next priority move, right after the tickets in progress, is a
   **landing page with a waiting list or pre-order**, before pushing on sales.
2. **Engines independent of the core.** A study and refactoring ticket makes the **Change Summary**
   and **Form Rebase** engines usable without `@formrail/core`, to offer them also to those who use
   React Hook Form or TanStack Form. Current state: the Change Summary computation already consumes
   only `values`/`baseline`; the Form Rebase hook depends on the core's form type
   (`UseObjectPageFormReturn` in `use-form-rebase.ts`), while `compute-rebase.ts` is pure. The visual
   components use the core's tokens and `cn`.
   Study of the boundaries and choices (ticket #489):
   [`pro-engines-decoupling.md`](./pro-engines-decoupling.md). Maintainer decisions of 2026-11-14:
   subpath `@formrail/pro/engine` with `@formrail/core` as an optional peer (1a), React Hook Form /
   TanStack Form adapters in dedicated subpaths with optional peers (2a, child tickets), work split
   into child tickets (3a).
3. **Target: company teams** (ERP, business management software, administrative portals). They have a
   budget, feel the pain of competing on data and accept licence costs if they solve a structural
   problem.
4. **Commercial model: per-developer one-time-payment licence, with 12 months of updates included and
   unlimited-time use of the versions received (maintainer decision of 2026-11-26)** (standard
   enterprise scheme). The sale goes through a **Merchant of Record**, which handles EU VAT and
   invoicing. Reference MoR: **Paddle** (maintainer decision of 2026-11-26): no upfront cost,
   commission 5% + $0.50 per transaction according to the public pricing page (read on 2026-11-26).
   Lemon Squeezy, cited earlier as an example, no longer accepts new registrations and closes on
   2027-03-31 (banner on the official pricing page, read on 2026-11-22).
   **To verify before opening the account**: that Paddle allows linking the purchase to the granting
   and revocation of access to the GitHub Packages registry (webhook or order export), without licence
   keys (see point 10 of the 2026-11-26 decisions, "Granting registry access"); that it accepts the
   seller's legal form and jurisdiction; the tax treatment, to be agreed with a qualified adviser.

**Distribution**: as per §2.4, updated on 2026-11-26 (GitHub Packages instead of the private npm org,
superseded; no runtime licensing).

### Decisions of 2026-11-26 (maintainer): distribution and paid early access

1. **Distribution**: GitHub Packages, free GitHub org `formrail-dev`, package `@formrail-dev/pro`
   installed with an npm alias (`"@formrail/pro": "npm:@formrail-dev/pro@^0.2.0"`). Reason and details
   in §2.4.
2. **Immediate access to 0.x**: buyers get the 0.x versions right away.
3. **Price**: €149 per developer for the first 12 months (early access), then list price €199. The
   early-access price applies up to a quantity or date limit: **the value of the limit has not yet
   been fixed by the maintainer** and must be written here as soon as it is decided.
4. **One-time payment**, with no automatic renewal.
5. **After the 12 months**: the versions received within the 12 months remain usable; a developer who
   leaves the team can be replaced.
6. **Trial and evaluation**: free use in development and evaluation; licence required in production.
7. **Refund** within 14 days without giving a reason, for everyone, except fraud or abuse (maintainer
   decision of 2026-11-27).
8. **Support**: by email, best-effort, reply within 2 working days, no public deadline.
9. **Checkout** — **SUSPENDED by the standby decision (below)**: Paddle overlay, with Paddle.js
   loaded only on user action and only on the purchase page.
10. **Granting registry access**: by hand, within 2 working days of the purchase.
11. **Design partner**: 50% discount, application through a separate Tally form.
12. **Technical articles** on `/articles/`.
13. **Order** — **partially SUSPENDED by the standby decision (below)**: design partners and articles
    first; the checkout only after the domain is approved.
   (The checkout part is suspended; design partners and articles stay.)

### Decision of 2026-11-26 (evening): sale on standby

Maintainer decision (ticket #715). While there is no real revenue:

- **no checkout, payment button or link** on the public site: neither a purchase page (`/teams/buy/`
  answers 404), nor Paddle.js, nor requests to Paddle domains. Only the links to Paddle's legal
  documents already present in the legal pages remain. An automatic guard enforces it
  (`scripts/site-no-checkout.test.mjs`, `e2e/site/no-checkout.spec.ts`), to be removed or loosened
  only in the ticket that reopens the sale, on the maintainer's instruction;
- tickets **#694, #695 (Paddle checkout on `/teams/buy/`) and #696 (opening of paid early access) are
  suspended** and resume only on the maintainer's instruction;
- in place of the checkout: the **Early Access / contact request form** (dedicated ticket);
- **points 9 (checkout) and 13 (order: the checkout only after domain approval) of the 2026-11-26
  decisions above are suspended**, not cancelled: they stay written for when the sale reopens.

### Decisions of 2026-11-27 (maintainer): refund and data retention

These are maintainer decisions, taken on 2026-11-27 (ticket #692). The text of the privacy notice was
confirmed by the maintainer in writing on 2026-11-27, after the code review approval, with
three adjustments: in the purchase data no "renewals included" (we speak of repurchase, like the
licence), the "Emails you send us" section declares purpose, legal basis (art. 6(1)(c) for privacy
requests, 6(1)(f) for the others) and provider (Gmail, Google), and the right to object speaks of
"this keeping".

1. **Refund**: within 14 days without giving a reason, for everyone, except fraud or abuse (change to
   point 7 above).
2. **Purchase data, minimization**: for 7 years from the end of the year of the sale only the sale
   data is kept: transaction identifier, date, amount, country and email. Address, VAT number,
   company name and the other data received from Paddle are deleted at the end of the 12 months of
   licence updates or, if repurchased, of the last licence purchased, or earlier if the licence ends
   (refund, chargeback, serious breach).
3. **GitHub usernames**: deleted at the end of registry access (end of the 12 months of updates
   without repurchase, refund, chargeback, serious breach, replacement of the developer for the
   replaced name).
4. **Emails**: those received at formrail.dev@gmail.com that concern a purchase (refund, replacement
   of a developer, problems with the licence) are kept like the sale data (7 years from the end of the
   year of the sale). The others, including privacy requests and also those of people who did not
   buy, are deleted 2 years after the last reply, or 2 years after receipt if there is no reply.
   Copies of design-partner applications follow the period of their section (24 months from the
   application). In the privacy notice the rule is in a general section, "Emails you send us", valid
   for everyone.
5. **Legal basis**: delivery and management of the licence rest on the contract, art. 6(1)(b) GDPR.
   Keeping the sale data rests on the legitimate interest in defending oneself in case of checks or
   disputes, art. 6(1)(f) GDPR, without asserting a legal obligation. The right to object follows
   (art. 21 GDPR), written in "Your rights" in a separate sentence with the wording of art. 21(1): we
   stop, unless the data is needed to establish, exercise or defend a legal claim or there are
   compelling legitimate grounds that override the interests of the data subject.

**Demo data of stories and examples** (epic #512, ticket #515): domain rule and ratchet guard on legacy
data in `CONTRIBUTING.md`, section "Demo data".

### Planning proposals (not decided by the maintainer)

Planning can use them as guidance, but not as constraints. A proposal becomes binding only if the
maintainer confirms it.

- **Pro positioning**: "record-editing integrity", that is never losing the user's edits, showing
  what changes and handling concurrent updates. The core is Change Summary, Form Rebase, robust
  dirty-tracking with asynchronous hydration and production-grade asynchronous Combobox. The
  virtualized List Report stays in the Pro but is not the main selling argument.
- **Requirements of company buyers**, to cover before selling:
  - written licence terms (done in ticket #691: `packages/pro/LICENSE` and the `/license/` page, same
    text);
  - invoice (through the Merchant of Record);
  - description of support;
  - security note: no network access and no key. The built bundle is already verified by
    `packages/pro/test/dist.smoke.test.ts` ("contains no runtime licensing / network mechanism").
- **Consistency of the public documentation**: the README must not present as Pro features that have
  not been built (today it cites "advanced dirty-tracking" and "a dialog with an embedded grid").
- New Pro tickets favour what strengthens the positioning above. The low priority of the polish items
  #484-#486 instead comes from the maintainer: "to be queued as small low-priority tickets",
  2026-11-13.

### Questions still open (to bring to the maintainer when needed, not decided)

The questions on price, trial and evaluation, after the 12 months, support and granting of access
were resolved on 2026-11-26 (see "Decisions of 2026-11-26" above), as was the scope of the Pro
package: `@formrail-dev/pro` (§2.4), with the GitHub org `formrail-dev` already created on 2026-11-26.
Still open:

- ~~**Identity and details of the licensor**~~: resolved in ticket #691 (stated in the licence terms).
- **Waiting-list tool and privacy (GDPR)** and **use of Formrail in an internal application as a real
  trial** (§6 point 3) stay as before, not decided.
