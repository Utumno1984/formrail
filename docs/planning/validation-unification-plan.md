# Uniform validation (Zod) across form, fields and footer: survey and plan

> Planning document. No implementation. Status: **maintainer decisions received and recorded in
> §5**; the tickets have been published on GitHub (numbers in §6).
> Survey date: 2026-11-01, on `main` @ `68ddd39`. Everything written in §1 was read in the code
> (`packages/core/src`), not recalled from memory; where a statement is an inference from reading the
> code and not an executed proof, it says so.

## 0. Goal and method constraint

Introduce runtime validation with Zod on the Object Page form and footer (spec
`design-system-spec.md` §1.5: "runtime validation schema shared between form and API call, fails
loudly on a missing field"). **Maintainer constraint, a general rule of the project**: the solution
is uniform across *all* the points that today handle errors/validation state, not a mechanism added
only to the footer. So the plan has two inseparable halves: (a) align what is already fragmented,
(b) graft Zod onto the aligned model, not on top of the fragmented one.

Survey points: `Field`, `useFieldControl`/`FieldContext`, `FieldMessage`, `Input`, `Select`,
`Combobox`, `useObjectPageForm`, `useFocusFirstInvalidField`, `useDirtyGuard`, plus
`ObjectPageFooter` and the stories that today serve as "documentation" of the flow.

State of the package: `@formrail/core` is `0.0.0`, never published: a public API change today is not
a breaking change towards real users, but it is still an API choice that belongs to the maintainer.

---

## 1. Survey: how it is today (and where it is already fragmented)

### 1.1 Current model on one page

| Piece | What it produces/consumes | Error type |
|---|---|---|
| `useObjectPageForm` | `validate?: (values) => Partial<Record<keyof Values, string>>`; `fieldErrors` (same type); `saveError: unknown` | `string` per **top-level** key |
| `Field` | prop `error?: ReactNode`; if non-empty → `aria-invalid` on the control + `FieldMessage tone="error"` + id in `aria-describedby` | `ReactNode` |
| `FieldContext`/`useFieldControl` | `FieldControlProps`: `id`, `aria-labelledby`, `aria-describedby`, `aria-invalid`, `aria-required`, `disabled`, `readOnly`, `aria-readonly`; `state`/`interactionBlocked` non-enumerable | — |
| `Input`/`Select`/`Combobox` | read `FieldContext` and apply the attributes above | — |
| `useFocusFirstInvalidField` | `fieldErrors: Partial<Record<string,string>>`; finds the controls with `[name="<key>"]` in the container | string keys |
| `ObjectPageFooter` | `message?: ReactNode` + `messageTone`; `role="status"` `aria-live="polite"` always mounted | `ReactNode` |
| `useDirtyGuard` | `when: boolean` | — |

**No piece of code connects the form to the `Field`**: the consumer writes by hand
`<Field error={form.fieldErrors.x}>` and `<Input name="x">` for every field (visible in the
`ObjectPageFooter` story and in the `UseObjectPageFormFixture` fixture).

### 1.2 Fragmentations and inconsistencies found (already present, before Zod)

**F1 — Two "languages" for the same error: `string` in the form, `ReactNode` in the Field.**
`fieldErrors` is `Partial<Record<keyof Values, string>>` (`use-object-page-form.ts`), `Field.error`
is `ReactNode` (`Field.tsx`). It works because a `string` is a `ReactNode`, but there is no shared
"field error" type and no place for more than one message or a stable code (useful for i18n and for
tests). Zod produces `issues[]` with `code`, `path`, `message`: today there is nowhere to put them.

**F2 — The form→field link goes only through a DOM `name` attribute that the `Field` does not
know.** `useFocusFirstInvalidField` looks for `[name]`. `Field` has no `name` prop and does not
propagate it to the control (`FieldControlProps` does not contain it): the consumer must remember
`name` on every control *and* the same key on `error=`. Two independent keys to keep aligned by hand.

**F3 — `Select` cannot be reached by `useFocusFirstInvalidField` (a real defect, from reading the
code).** `SelectProps` excludes `name` (`Omit<..., 'name' | 'form' ...>`, a deliberate choice so
that the echo of Radix's native `<select>` is not passed through). The trigger is a `<button>`
without `name`, so an error on a `Select` field finds no element: no focus, and in dev a
`console.error`. `Combobox` instead accepts `name` (it extends `InputHTMLAttributes`); `Input` too.
Three controls, two behaviours. Not verified with an executed test: to be reproduced in the first
ticket that touches it.

**F4 — The `FieldContext` wiring is copied three times.** `Input.tsx`, `Select.tsx`, `Combobox.tsx`
repeat the same block (merge of `aria-describedby`, `control?.x ?? rest.x` for `id`,
`aria-labelledby`, `aria-invalid`, `aria-required`, `aria-readonly`, `disabled`, `readOnly`). Every
new validation property (e.g. `name`, `aria-errormessage`, `data-*`) would have to be added in three
places: this is how inconsistencies are born. The invalid-style classes are also tripled
(`aria-invalid:border-rop-error` in `Input.tsx`, `Select.tsx`, `internal/combobox-styles.ts`).

**F5 — Two producers of `aria-invalid`.** Inside a `Field` it is produced by the `Field` (only
`true` or absent); outside, or in a story, the consumer writes it. The fixture
`UseObjectPageFormFixture` uses `<input aria-invalid={k in form.fieldErrors}>` + a hand-written
`aria-describedby`: `k in` also counts a key with value `undefined`, while the form and the hook
treat `undefined` as "no error" (`invalidKeys`/filter in `save`). Three places that define "is
invalid" with three slightly different rules (`hasContent(error)` in the Field, `!== undefined` in
the form and in the hook, `k in` in the fixture).

**F6 — Two parallel paths to the same error state.** The `ObjectPageFooter` story ("Supplier
required", in Italian in the original story) keeps its own `useState` `fieldErrors` and its own
check, ignoring `useObjectPageForm({ validate })`/`form.fieldErrors` introduced later (#77/#81).
Stories are the de facto documentation: they show two different ways of doing the same thing.

**F7 — Different announcement semantics for "error", three times.** Field error: `FieldMessage` is
not live (announced through `aria-describedby` + `aria-invalid` when focus reaches the field).
`MessageStrip` `tone="error"`: `role="alert"`. `ObjectPageFooter` with `messageTone="error"`:
`role="status"` + `aria-live="polite"`. It is not necessarily wrong (they are different levels:
field, page, action), but it is written nowhere *which level uses which*, and Zod adds a fourth case
("validation failed, N invalid fields") without a rule on where to announce it.

**F8 — A throwing `validate` ends up in `saveError`, that is in the footer, mixing two
categories.** Documented contract (`use-object-page-form.ts`): if `validate` throws, `saveError` is
set. With Zod the natural case is `schema.parse(values)`, which throws a `ZodError` whose `message`
is a JSON of issues: it would end up as text in the footer instead of as field errors. The current
contract pushes towards the wrong use (parse instead of safeParse).

**F9 — `fieldErrors` only with top-level keys; Zod produces paths.** `setValue`/`setValues` are
top-level (`keyof Values`), `fieldErrors` likewise, the hook looks for `[name="a"]`. A Zod issue has
`path: ['address','city']` or `['lines', 0, 'qty']`. There is no path serialization convention shared
by form, `Field`/`name` and hook.

**F10 — "All or nothing" clearing of errors.** Any `setValue`/`setValues`/`reset` clears *all* the
`fieldErrors` (documented, "per-field clearing is not supported", and covered by a story-test "Typing
after a failure clears every field error at once"). Writing in one field makes `aria-invalid` and the
message of all the other still-invalid fields disappear. With schema-driven validation (where an
error depends on several fields) the all-or-nothing behaviour becomes more visible.

**F11 — Invalid state on locked/disabled fields is undefined.** A `forced`/`locked` `Field` with an
error shows the message and `aria-invalid`, but the hook skips non-focusable controls (`disabled`,
inert) and, if they are the only invalid ones, does nothing (only a `console.error` in dev). No rule
says whether a forced/locked value must be validated.

**F12 — Default texts scattered with different mechanisms.** `DirtyGuardLabels` (`labels` object),
`ObjectPageFooter` (`toneLabel`, `label` as flat props), `Select` (`emptyLabel`,
`unknownValueLabel`). The Zod messages are in English by default. There is no policy: the consumer
passes the texts, the library does not translate validation errors (to be declared, not to be
built).

**F13 — Small technical duplication:** `isDev()` is defined identically in
`use-object-page-form.ts`, `use-focus-first-invalid-field.ts` and
`object-page/ObjectPageContext.ts`.

**`useDirtyGuard`: no error fragmentation found.** It depends only on `when: boolean` and reads
neither `fieldErrors` nor validity. Dirty and invalid are orthogonal *by construction* (an invalid
form is typically dirty; a `save` that fails validation neither cleans nor dirties). It does not need
changing; it needs **an e2e test pinning** that a failed validation does not change `isDirty`, does
not remove `beforeunload` and does not open the guard's dialog (see T9). The only point of contact
with F12 is the `labels` mechanism.

### 1.3 What is already good and must be kept (do not redo)

- `FieldMessage`: a single component for help/error, identical geometry (`tone`), no live region, id
  referenced only if the message exists.
- Rule "an `undefined` key = no error" in the form and in the hook.
- New identity of `fieldErrors` on every failed `save` (the hook refocuses even with equal errors).
- `Field` as the only place that computes `aria-describedby` (reason → error → help) and the
  `interactionBlocked` contract.
- Synchronous validation before any async work: `isSaving` is not touched on failure.

---

## 2. Proposed unified design

Principle: **a single "field error" model, a single producer of invalid state (the `Field`), a
single way to connect form and field, a single wiring of the controls; Zod is an adapter that
produces that model, not a parallel path.**

### 2.1 Shared data model

- A public type `FieldErrors` = map `path → message (string)`; the path is a dot-notation string
  (`supplier`, `address.city`, `lines.0.qty`). Value `undefined` = no error (rule already in force,
  now in a single internal helper `invalidPaths()` used by form, hook and `Field`/fixture — closes
  F5).
- For each path the **first** Zod message applies (less specific issue ignored in v1). Extensible
  in the future to `{ message, code }` without breaking (`string` remains valid) — not in v1.
- `Field.error` stays `ReactNode` (it may have markup); the form produces `string`. The link is a
  prop of the Field, not a manual conversion (§2.3). Closes F1 without forcing a single type.

### 2.2 Wiring of the controls (closes F2, F3, F4, F5)

- A single internal hook `useFieldControlProps(rest)` (not exported) that returns the final
  attributes to spread on the control: merge of `aria-describedby`, precedence of the Field, `id`,
  `aria-*`, `disabled`, `readOnly`, **`data-rop-name`**. `Input`, `Select`, `Combobox` use it; no
  `control?.x ?? rest.x` remains in the three files.
- Invalid style in a single shared token/constant (today tripled).
- `Field` gains `name?: string`: it puts it into the `FieldControlProps` as the attribute
  `data-rop-name` (not `name`, which for `Select` is excluded on purpose — F3) and also as the native
  `name` for native controls where it is safe (`Input`, `Combobox`).
- `useFocusFirstInvalidField` looks first for `[data-rop-name]`, then falls back on `[name]`
  (compatibility: consumers who use their own controls with `name` keep working, and the behaviour
  documented today does not change).

### 2.3 Form → field link (§5 Q2)

**Decided (Q2):** explicit plus optional context.
1. Base: `<Field name="supplier" error={form.fieldErrors.supplier}>` — explicit, headless, no magic.
2. In addition, a thin context `ValidationProvider fieldErrors={form.fieldErrors}` (or equivalent):
   a `Field` with `name` reads the error from there if `error` is not passed; an explicit `error`
   wins. It removes the double name (F2) and the diverging stories (F6) without imposing a provider
   on whoever does not want it.

### 2.4 Zod (§5 Q1, Q3)

- The core today "depends on no schema library" (docstring of `validate`) and the bundle has a
  per-import budget: Zod must **not** enter the bundle of whoever does not use it.
- **Decided (Q1):** a `schema` option on `useObjectPageForm`, typed on the **Standard Schema**
  interface (`~standard.validate`), which Zod (≥ 3.24 / 4) implements, plus Valibot/ArkType, without
  the core importing `zod`. No `zodValidator` adapter and no optional peer (set aside by the
  maintainer).
- Translated into errors: issue → dot path → first message → the same `fieldErrors` (no parallel
  path). A schema failure does **not** throw: closes F8. A manual `validate` stays supported (same
  output), and `schema` + `validate` together: `schema` first, `validate` for the additional
  cross-field rules (to be confirmed, Q5).
- Parsing: does `save` pass the handler the *raw* values as today, or the parsed output of the
  schema (transforms/coerce)? Recommendation: raw values in v1 (no change to the `Values` type),
  parsed output as a future option — Q4.
- Synchronous in v1: a schema with an async `refine` must give a clear error in dev. It keeps the
  property "isSaving never touched on validation failure".

### 2.5 Footer and announcements (closes F7)

A rule written once (in the docs of the form and of `ObjectPageFooter`):

| Level | Where | Announcement |
|---|---|---|
| Field | `FieldMessage` + `aria-invalid` + `aria-describedby` | not live; after a failed save focus goes to the first invalid field (`useFocusFirstInvalidField`), so the screen reader reads it there |
| Form summary | `ObjectPageFooter message` (tone `error`) | `role="status"` polite, one line: "N invalid fields" (**only the count**, never the per-field messages, in line with the current footer docs) |
| Save error (network/server) | `ObjectPageFooter` `saveError` | same, the text of the error |
| Blocking page error | `MessageStrip` | `alert` |

A helper (e.g. `formatFieldErrorsSummary`/`useObjectPageForm().summary`) provides the summary string,
with text replaceable by the consumer (no translation in the core — closes F12 for the validation
part). The footer **stays presentational** (it does not read the form): it receives `message`.

### 2.6 Error clearing (§5 Q6, closes F10)

Recommendation: `setValue(name)` clears only the error of the touched path (and of its
descendants/ancestors); `reset` and a successful `save` clear everything; a new `save` recomputes
everything. *Implemented in #102 (the ticket prevails over the plan):* only the path and its
**descendants**, never the ancestors (an error on `address` stays until `address` is written or the
`save` is repeated). The root errors of the schema (`formErrors`, #100) follow `fieldErrors`:
example with `fieldErrors` = `{ name, 'address.city' }` and `formErrors` = `['Root']`,
`setValue('name', …)` removes only `name` and leaves `formErrors` unchanged (a root error is not tied
to a field); the following `setValue('address', …)` empties `fieldErrors` (the shared empty object
returns) and also clears `formErrors`. With only root errors, the first real change clears them.
`reset`, `reset(baseline)` and a successful `save` clear both; every failed `save` (schema, even with
only root errors, or `validate`) increments `validationAttempt`, the explicit focus trigger. This
**changes a documented behaviour and an existing story-test** ("clears every field error at once"):
under the project's regression rule (no test weakened) it must be approved by the maintainer and
explained in the PR, not done quietly.

### 2.7 Locked fields (closes F11, non-blocking)

Recommendation: a `forced`/`locked`/`disabled` field **is validated like the others** (the business
rule that forced the value can produce an invalid value); the message stays visible on the Field; the
hook, if all the invalid ones are non-focusable, does nothing (as today) but the summary in the
footer still counts them. Documented and covered by tests; no API decision.

### 2.8 `useDirtyGuard`

No API change. An e2e non-interference test (T9) and an example in the form docs that combines
`useObjectPageForm` + `useDirtyGuard` + validation.

---

## 3. Public API impact (summary)

Additions: `Field.name`; type `FieldErrors`; `useObjectPageForm({ schema })`; optional
`ValidationProvider`; summary helper. Compatible changes: hook lookup with `[name]` fallback.
Possible behaviour change: per-field clearing (Q6). Possible type change: `fieldErrors` from
`Partial<Record<keyof Values,string>>` to path-based `FieldErrors` (Q2/Q-paths: for flat values the
types stay compatible, key autocompletion is lost on nested paths).

## 4. Risks

- **Bundle budget** (governance): every new export must be measured; no `zod` import in the core.
- **Visual regression**: the invalid state must look identical on Input/Select/Combobox (today the
  consistency depends on three copies of classes); the visual matrix must be extended (ticket #4
  covers it for the viewports).
- **Virtual keyboard** (`useKeyboardSafe` in the Field): the hook's programmatic focus on an invalid
  field must respect the same scroll margin; to be verified in the mobile e2e.
- **Existing tests** not to be weakened: `Field.test`, `use-object-page-form.validate.test`,
  `use-focus-first-invalid-field.test`, e2e `field.spec` and `use-focus-first-invalid-field.spec`.

## 5. Maintainer decisions (formerly open questions)

All confirmed on 2026-11-01. Where there was no explicit answer ("go with your recommendation"), the
recommendation of the previous document applies.

| # | Decision | Answer | Origin |
|---|---|---|---|
| Q1 | How Zod comes in | **Standard Schema interface** in the core (structural types only, no `zod` import). **Not** a direct dependency, **not** an optional peer + adapter: the `zodValidator` adapter foreseen as a convenience in the previous version of this plan is therefore **set aside** | explicit |
| Q2 | Form → Field link | **Optional `ValidationProvider` context** (with an explicit `error` winning, if it has content). Not only `name` + `error=` | explicit |
| Q3 | Path convention | **Nested dot-notation paths** (`a.b.0.c`). Accepted cost: strict key typing is lost on nested paths | explicit |
| Q4 | `save`: raw or parsed values | **Raw in v1**; parsed possibly later | recommendation |
| Q5 | `schema` and `validate` together | **Both**. Detail fixed at ticket time: the schema runs first and, if it fails, `validate` is not called (it receives only values already valid for the schema) | recommendation |
| Q6 | Error clearing | **Per field/path on `setValue`**, no longer all-or-nothing; the story-test that documents the old behaviour is updated and renamed | explicit |
| Q7 | Summary in the footer | **Optional helper** with the count (`getErrorSummary`); the footer stays presentational | recommendation |
| Q8 | Server errors mapped to a field | **Out of scope**; separate ticket afterwards (public `setFieldErrors`). Not published now | recommendation |
| Q9 | Free or Pro | **Free** | explicit |

### Points that emerged while writing the tickets (not in the plan, none requires new decisions)

- **Refocus risk with per-path clearing.** `useFocusFirstInvalidField` fires on the identity of
  `fieldErrors`; a partial clearing produces a new non-empty object, so typing in a field would move
  focus to the first invalid one. Ticket #102 imposes the fix (the trigger must be "a failed
  `save`", not "a new object") and leaves the minimal form to the implementer, to be flagged in the PR
  as an API addition.
- **Root-level errors** (a `refine` on the whole object, empty path) have no field: ticket #100
  exposes them as `formErrors` and counts them in the summary (#103).
- **Async schema**: in v1 validation stays synchronous; an async schema gives an explicit error
  (`saveError` + `console.error` in development), it does not wait.

## 6. Published tickets

Dependency order. Each ticket has the standard format (Context / Goal / Acceptance criteria / Smoke
test / Technical notes / Edge cases / Review) and the Storybook requirements of `CLAUDE.md`
(Controls, Actions with `fn()`, real `play`).

| Order | Issue | Title | Depends on | Fragmentations closed |
|---|---|---|---|---|
| 1 | #97 | Field controls: a single internal wiring (`useFieldControlProps`), a single invalid style, a single `isDev` — refactor with no behaviour change | — | F4, F5 (style), F13 |
| 2 | #98 | `Field name` → `data-rop-name`: `useFocusFirstInvalidField` also reaches `Select`; stories/fixtures migrated to `Field` | #97 | F2, F3, F5, F6 (part) |
| 3 | #99 | Path-based `FieldErrors` with dot notation: shared type, single `invalidPaths()`, form and hook aligned | #98 | F1, F5, F9 |
| 4 | #100 | `useObjectPageForm({ schema })`: validation with Standard Schema (Zod-compatible), issues → `fieldErrors`, no dependency in the core | #99 | F8 |
| 5 | #101 | `ValidationProvider`: the `Field` with `name` reads its own error from the form (explicit `error` wins), footer stories migrated | #99 | F2, F6 |
| 6 | #102 | `fieldErrors`: per-path clearing on `setValue`/`setValues`, without moving focus (updates the all-or-nothing story-test) | #99 | F10 |
| 7 | #103 | Rule for error announcements (field / summary / save) and `getErrorSummary` for the footer, without coupling the footer to the form | #100, #101 (and #102 for one step of the e2e) | F7, F12 |
| 8 | #104 | Recipe story, non-interference e2e with `useDirtyGuard` and locked fields, visual matrix of the invalid states | #100, #101, #102, #103 | F11 |

Tickets #100, #101 and #102 all depend on #99 and are independent of each other: they are developed
one at a time in the order given (project pace: slow, ticket by ticket).

**Not published, to plan after the block:** a public `setFieldErrors` in the form to map server-side
validation errors to field messages (Q8, spec §1.5).
