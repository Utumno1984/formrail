# @formrail/pro

Pro tier of Formrail (commercial license, **to be defined**; see [LICENSE](./LICENSE)).

- `"private": true` on purpose: nothing is published until the private npm org exists (a guard test,
  `scripts/pro-package.test.mjs`, fails if `private` is removed or the license becomes MIT). There is
  no runtime licensing mechanism: no network access, no keys (asserted on the built bundle).
- The source is readable in this public monorepo; the Pro moat is the service/license, not code secrecy.
  The MIT license at the repository root covers `packages/core` only.
- Same toolchain as `packages/core` (tsup, Vitest, shared ESLint/tsconfig) and the same governance:
  per-import bundle budget in [`bundle-budget.json`](./bundle-budget.json) (checked by
  `npm run bundle:check`, regenerated with `npm run bundle:update-baseline -- --package packages/pro`),
  changeset required on every change. Storybook stories live under `Pro/` (included in dev, e2e and
  visual builds; the public GitHub Pages deploy sets `STORYBOOK_EXCLUDE_PRO=1` and publishes Free only).
- The engine (`computeChangeSummary`, `useChangeSummary`) works with any form state that exposes the
  current values and the saved baseline (e.g. core's `useObjectPageForm`). The components
  (`<ChangeSummary />`) use `@formrail/core` (`cn`, design tokens), declared as an **optional peer
  dependency** and treated as external by the build. The peer range must be revisited when pro is
  published.

## Entries, and who installs `@formrail/core`

| Import | What it holds | `@formrail/core` |
|---|---|---|
| `@formrail/pro/engine` | The engines: `computeChangeSummary`, `useChangeSummary`, `inferSegmentLabel`, `formatChangeValue`, `computeRebase`, `useFormRebase` and their types (`RebaseFormBinding`, ...) | **Not needed**: nothing in this entry imports it, not even a type |
| `@formrail/pro/react-hook-form` | `useReactHookFormBinding`, the React Hook Form adapter (see [React Hook Form](#react-hook-form)) | **Not needed** (needs `react-hook-form`, an optional peer) |
| `@formrail/pro/tanstack-form` | `useTanStackFormBinding`, the TanStack Form adapter (see [TanStack Form](#tanstack-form)) | **Not needed** (needs `@tanstack/react-form`, an optional peer) |
| `@formrail/pro` | Everything above (but the two adapters) plus the components (`ChangeSummary`, `RebaseNotice`, `VirtualListReport`, `VirtualListReportTable`) and `useFormRebase` typed for core's `useObjectPageForm` | **Required**: install it next to pro |

`@formrail/core` is an **optional** peer dependency (`peerDependenciesMeta`), so npm does not install it
by itself:

- With React Hook Form, TanStack Form or a form of your own, install `@formrail/pro` and import only
  `@formrail/pro/engine` (and the adapter subpath of your form library). `npm ls @formrail/core` then reports it absent.
- With core's Object Page or the Pro components, install both: `npm install @formrail/core @formrail/pro`.

Importing `@formrail/pro` (the main entry) without the core installed fails, but **where** it fails
depends on your TypeScript setup:

- With `skipLibCheck: false`, `tsc` reports `Cannot find module '@formrail/core'` in the declaration
  files of `@formrail/pro`.
- With `skipLibCheck: true`, the default of the Vite and Next.js templates, `tsc` **passes**. The core
  types silently become `any`, so even a wrong argument to a core-typed API type-checks. The error then
  comes from the bundler, or when the module loads, and it does not always name a missing package:
  - Vite 8 replaces a missing optional peer with an empty stub, so the build fails on the first import
    from it: `[MISSING_EXPORT] "cn" is not exported by "__vite-optional-peer-dep:@formrail/core:@formrail/pro"`;
  - esbuild: `Could not resolve "@formrail/core"`;
  - Node, ESM: `ERR_MODULE_NOT_FOUND` (`Cannot find package '@formrail/core'`); CommonJS:
    `Cannot find module '@formrail/core'`.

So without the core, import **only `@formrail/pro/engine`**, never `@formrail/pro`. Nothing in that
entry needs the core, at runtime or in its types, whatever `skipLibCheck` is.

`@formrail/pro/engine` is a subpath export, so it resolves with `moduleResolution` `bundler`, `node16` or
`nodenext`. The legacy `node` / `node10` resolution ignores the `exports` map and does not find it, the
same limit as `@formrail/core/internal`.

`useFormRebase` of `@formrail/pro/engine` takes any form that keeps the `RebaseFormBinding` contract
(`baseline`, `values`, `isSaving`, `saveError`, `reset`, `setValues`); core's `useObjectPageForm()` is one
as is. For React Hook Form and TanStack Form use the ready-made bindings below. The study of the boundary is in `docs/planning/pro-engines-decoupling.md`.

## React Hook Form

`@formrail/pro/react-hook-form` binds a React Hook Form form to the engines: the Change Summary against the
saved baseline and the form rebase, without `@formrail/core`.

### Install

```sh
npm install @formrail/pro react-hook-form
```

- `react-hook-form` `^7.92.0` (the version range tested), `react` / `react-dom` 18 or 19. `@formrail/core` is
  not needed. `react-hook-form` is an **optional** peer dependency of `@formrail/pro`, used for the types
  only: nothing of the library is imported at runtime. The adapter calls the methods of your `form` and
  reads two **internal** fields of its `control` (see [Internals read](#internals-read)).
- `@formrail/pro` is `"private": true` today: it will be installed from the private npm org once that
  exists.
- The main entry `@formrail/pro` does not re-export the adapter, so its declaration files never name
  `react-hook-form`; import the adapter from its subpath (`moduleResolution` `bundler`, `node16` or
  `nodenext`).

### Usage

```tsx
import { useForm } from 'react-hook-form';
import { useChangeSummary, useFormRebase } from '@formrail/pro/engine';
import { useReactHookFormBinding } from '@formrail/pro/react-hook-form';

function InvoiceEditor({ saved }: { saved: Invoice }) {
  const form = useForm<Invoice>({ defaultValues: saved });
  const binding = useReactHookFormBinding(form);
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { rebase, conflicts, keepMine, acceptTheirs, isPending } = useFormRebase(binding);

  const save = form.handleSubmit(async (values) => {
    const stored = await api.saveInvoice(values);
    binding.reset(stored); // the stored record becomes the baseline, inside the handler
  });
  // ...inputs with form.register(...), the summary from `entries`, a "Save" bar shown while !isEmpty
}
```

- `binding.values` / `binding.baseline` are immutable snapshots (React Hook Form mutates its values in place
  and clones the defaults it receives): a new object only when the content changes, the same object across
  renders that change no value (blur, `trigger()`, a parent's state), so the summary is never stale and is not
  recomputed for nothing.
- Hydration after the mount: `form.reset(data)`, the `values` prop of `useForm`, or `defaultValues` as an
  async function (`defaultValues: () => api.loadInvoice(id)`). The form is not dirty, no summary row ever
  shows (while an async `defaultValues` loads, `formState.isLoading`, `binding.baseline` is `binding.values`:
  nothing is edited yet), no `type: 'change'` event reaches your `watch` / `subscribe` callbacks, and for
  `useFormRebase` it is a rehydration (open conflicts closed). If the async `defaultValues` rejects, React
  Hook Form stays `isLoading` and the form keeps showing no change: catch in the loader (return the record or
  an empty one, show the error yourself), never let it reject.
- `resetField(name, { defaultValue })` replaces React Hook Form's defaults, so it is a rehydration too: it
  closes the open conflicts, also those on other fields (the user's values stay, as edits against the new
  baseline). Resolve the conflicts before, or call it only when none is open. `resetField(name)` without a
  default changes no baseline.
- When the `values` prop changes while the user has edits, React Hook Form decides: by default the new
  values replace the edits; with `resetOptions: { keepDirtyValues: true }` the edits stay. Either way the
  summary is computed against the defaults React Hook Form holds then, never against an older baseline.
  For server updates during the editing, prefer `rebase(data)` (below): it keeps the edits and reports
  the conflicts.
- Give every field a default in `defaultValues` (`''` for an empty text input), as React Hook Form asks for
  `isDirty`. A field registered later without a default enters `values` (React Hook Form writes the input's
  `''`) but not the baseline, so it is listed as added. The baseline never changes because a field registers:
  the open conflicts stay open.
- The most common way to miss it: a default declared **on the field** instead of in `useForm`, the
  `defaultValue` of a `Controller` / `useController` (a third-party control) or the `defaultValue` attribute of
  an `<input>` passed to `register`. React Hook Form counts it for `isDirty`, the summary does not: the field
  shows as an "added" row on an untouched form. Move the default into `useForm({ defaultValues })`.

### Saving

- `binding.isSaving` is `formState.isSubmitting`; `binding.saveError` is `null` unless the last submit failed
  (blocked by validation, or a handler that threw before `binding.reset(saved)`: then it is
  `formState.errors`). A submit that `binding.reset(saved)` ended has saved: its `saveError` is `null` even if a
  validation error appeared while the server was saving (the user kept typing). That error stays on its field,
  and blocks the next submit as usual. This holds for that one submit: the next one, also after a
  `form.reset()`, `form.reset(data)` or a change of the `values` prop (React Hook Form sets `submitCount`
  back to 0, as in its "reset on `isSubmitSuccessful`" pattern), is reported as it ends.
- Call `binding.reset(saved)` **inside** the `handleSubmit` handler, before it resolves: a server update
  that came during the save is queued (`isPending`) and merged against what was saved. Resetting later, in an
  effect on `isSubmitSuccessful`, would come after the queued merge and overwrite it.
- The user can keep typing while the save is in flight. `reset(saved)` called during the save ends it with
  the same field-by-field rule as core's `save` (`useObjectPageForm`, which has no id key: there an array
  edited during the save is always kept whole, as here without `arrayIdKeys`): `saved` becomes the baseline; a field edited since the save started keeps the typed
  value and stays dirty (in the summary and in `dirtyFields`); every other field takes the value the server
  stored, its normalization included, and is clean. Nothing edited meanwhile: `values` is `saved` itself.
  "Since the save started" is measured from the values when `isSaving` turned `true`, field by field. The
  rows of an array are matched by id when you pass the id key, the same `arrayIdKeys` you give the engines:
  `useReactHookFormBinding(form, { arrayIdKeys: { lineItems: 'id' } })`. A reorder by the server then never
  moves an edit to another row, and the rows take the server's order (the user's, if the user reordered
  them). Without an id key, or with a row without id, an array edited during the save is kept whole. A
  discard (`form.reset()`, `binding.reset()`) or a rehydration during the save wins: `reset(saved)` is then a
  plain hydration.
- What the binding writes during a save (see "How the binding writes" below) never goes through React Hook
  Form's `reset`, which would end `isSubmitting` and make `handleSubmit` skip its own end. So `isSaving`
  stays `true` until the handler really returns, and `isSubmitted`, `isSubmitSuccessful` and `submitCount`
  are React Hook Form's. One exception: a `reset(saved)` whose record omits a top-level key the form holds
  (any such key: only a reset can remove one) is written with a reset, and ends the submit there.
- One submit at a time: keep the submit button disabled while `isSaving` (as the examples do). A second
  `handleSubmit` started while the first is in flight shares its start: the first `reset(saved)` ends the
  tracking, and what the user types during the second one is not kept by its `reset(saved)`.
- Call `useReactHookFormBinding` in the component that calls `useForm` (or under it with
  `useFormContext()`). In a child that does not re-render on React Hook Form's state (a `React.memo`
  component that receives `form` as a prop), `formState.isSubmitting` never reaches the binding: pass
  `isSaving` yourself, or the save is not seen and what is typed during it is not kept.
- A submit that succeeds closes the open conflicts; one that fails (handler error, validation) leaves them
  open, and a queued update is merged anyway.
- A save that does not go through `handleSubmit` (a mutation of your data layer): pass its state,
  `useReactHookFormBinding(form, { isSaving: mutation.isPending, saveError: mutation.error })`. Each option
  replaces its own mapping; pass both. Call `binding.reset(saved)` while `isSaving` is still `true` (in the
  `mutationFn`, after the request, before it returns): once `isSaving` is `false`, `reset(saved)` is a
  plain hydration and replaces what the user typed during the save.

### Server updates: `rebase`

`rebase(incoming)` merges a newer version of the record into the user's draft: the fields the user did not
touch take the server value, the ones both changed keep the user's value and are listed in `conflicts`, to
resolve with `keepMine(path)` / `acceptTheirs(path)`. The engine calls `binding.reset(incoming)` then
`binding.setValues(merged)` in one batch.

### How the binding writes

What `binding.reset` / `binding.setValues` change (a rebase, `acceptTheirs` / `keepMine`, `reset(saved)`, a
discard) is written to React Hook Form once, at the end of the synchronous run, without its `reset`:
`setValue` on each field whose value changes, and only those, then `resetDefaultValues` with the baseline.

- the rows of a `useFieldArray` are not remounted: the input the user is typing in stays the same node,
  keeps the focus (on mobile, the keyboard stays open) and its caret, since a field the binding does not
  change is never written. React Hook Form re-creates the rows only when the array itself changes shape:
  rows added, removed, or reordered by id (`arrayIdKeys`); the focus then never stays on a node that shows
  another row;
- no validation run, no `type: 'change'` event, the `onChange` of a `Controller` is not called, and no render
  ever shows the server value in a field the user edited;
- `dirtyFields` / `isDirty` are computed against the baseline (`incoming` for a rebase): only the user's
  edits stay dirty;
- the write happens at the end of the synchronous run (before the next render is painted): in the same
  function, right after `binding.reset(...)`, read `binding.values`, not `form.getValues()`;
- a write of yours in the same run, after the binding's (`form.setValue`, a `Controller`, `form.reset`, for
  example a timestamp set right after `binding.reset(saved)` in the `handleSubmit` handler), comes later in
  call order and wins: on the fields it changes it is kept, in `form.getValues()`, in `binding.values` and in
  the DOM; on the others the binding's write stands, rows the binding added, removed or reordered included:
  your writes in the fields of its rows stay on the row you wrote them in (matched by id with `arrayIdKeys`,
  by index without), and a write in a row the binding removed goes with that row. A reset with new defaults
  (`form.reset(data)`, the `values` prop, `resetDefaultValues`) replaces the binding's write whole. React
  Hook Form sends no event for a write that leaves a field as it already was, so there the binding's value
  stands; a `useFieldArray` operation of yours that adds, removes or reorders rows of an array the binding
  also wrote keeps your array whole, also when the binding changed its rows too (without `arrayIdKeys` a
  reorder keeps the length, so the rows are merged by index: pass `arrayIdKeys` for rows the user can
  reorder);
- a write of yours made before `binding.reset` / `binding.setValues` in the same run (a `useFieldArray`
  `append` or `remove` included) is what the binding writes on top of: `setValues` keeps it on the fields its
  patch does not name, `reset(record)` (outside a save, see "Saving") and a `setValues` of that field come
  later and replace it;
- only a top-level key that must go (a record that omits it) is written with React Hook Form's `reset`
  (keeping the mounted fields with `shouldUnregister`): the rows then remount, and during a save the submit
  ends there;
- `touchedFields`, `submitCount` and the submit flags are kept;
- validation errors: the error of a field the rebase leaves as it was stays; the error of a field that
  takes the server value is removed (it was about a value the field no longer has); validation runs again
  at the next change or submit. `acceptTheirs` removes the error of the field it changes, `keepMine` keeps it.

### `isEmpty`, not `formState.isDirty`

Drive the save bar and the dirty guard from `useChangeSummary().isEmpty`, never from React Hook Form's
`formState.isDirty`: the two can disagree, and the summary is what the user reads. Known divergences (study
§7, `docs/planning/pro-engines-decoupling.md`):

- an HTML input returns a string: a field hydrated with the number `10` and typed back as `10` is `'10'`, a
  change for the summary (another type), clean or dirty for React Hook Form depending on how it is registered
  (`valueAsNumber`);
- with `shouldUnregister`, a field that unmounts leaves the values: for the summary it is a missing key (a
  `removed` row), not `undefined`;
- a reorder of a `useFieldArray` declared in `arrayIdKeys` is no change for the summary, a change for React
  Hook Form. The ids `useFieldArray` generates for `fields` are not in the values, so they never reach the
  summary.

### Internals read

React Hook Form has no public API that gives its current defaults synchronously (`formState.defaultValues`
is the state of the last render), so the adapter reads two internal fields of `form.control`:

- `control._defaultValues`: the defaults React Hook Form holds, the source of `binding.baseline`. A new
  object after every reset, the `values` prop and `resetField` with a default (a rehydration);
- `control._options.shouldUnregister`: the `shouldUnregister` option, to keep the mounted fields when a
  write has to go through `reset` (a top-level key to remove).

They are not part of React Hook Form's public API: a release can rename them. The tests of `@formrail/pro`
pin both, and how they behave, against the tested version (`react-hook-form` `7.92.0`, the minimum of the
peer range); in development a form without them gets a `console.warn` naming the field, instead of a baseline
`{}` where every field is listed as added. If you see that warning after upgrading `react-hook-form`, stay on
the last version that does not show it.

## TanStack Form

`@formrail/pro/tanstack-form` binds a TanStack Form form (`useForm` of `@tanstack/react-form`) to the engines:
the Change Summary against the saved baseline and the form rebase, without `@formrail/core` and without
`react-hook-form`.

### Install

```sh
npm install @formrail/pro @tanstack/react-form
```

- `@tanstack/react-form` `~1.33.5`: tested on 1.33.x; a wider range follows a verified update. `react` / `react-dom` 18
  or 19. `@formrail/core`
  is not needed. `@tanstack/react-form` is an **optional** peer dependency of `@formrail/pro`, used for the
  types only: nothing of TanStack Form (`@tanstack/react-form`, `@tanstack/form-core`, `@tanstack/store`) is
  imported at runtime. The adapter calls the methods of your `form` (`form.store`, `form.baseStore`,
  `form.setFieldMeta`, `form.Subscribe`, see [What the adapter reads](#what-the-adapter-reads)).
- `@formrail/pro` is `"private": true` today: it will be installed from the private npm org once that
  exists.
- The main entry `@formrail/pro` does not re-export the adapter, so its declaration files never name
  `@tanstack/react-form`; import the adapter from its subpath (`moduleResolution` `bundler`, `node16` or
  `nodenext`).

### Usage

```tsx
import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase } from '@formrail/pro/engine';
import { useTanStackFormBinding } from '@formrail/pro/tanstack-form';

function InvoiceEditor({ loaded }: { loaded: Invoice }) {
  // The record as the server has it, as the defaultValues of useForm.
  const [saved, setSaved] = useState(loaded);
  const form = useForm({
    defaultValues: saved,
    onSubmit: async ({ value }) => {
      const stored = await api.saveInvoice(value);
      binding.reset(stored); // the stored record becomes the baseline, inside onSubmit
    },
  });
  const binding = useTanStackFormBinding(form); // Values inferred from defaultValues, no generic needed
  // `saved` follows the baseline: after a save and after a rebase, also one queued until a save ends.
  useEffect(() => setSaved(binding.baseline), [binding.baseline]);
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { rebase, conflicts, keepMine, acceptTheirs, isPending } = useFormRebase(binding);
  // ...form.Field with your inputs, the summary from `entries`, a "Save" bar shown while !isEmpty,
  // "Discard" calling binding.reset()
}
```

The Example of the Storybook page "Pro/Integrations/TanStack Form" is a complete, copy-paste version of
this component.

- Call `useTanStackFormBinding` in the component that calls `useForm`, after it. In a child of it (`withForm`, a
  form passed as a prop) it works with one painted frame of delay: see
  [What the adapter reads](#what-the-adapter-reads).
- **Keep `defaultValues` on the saved record**, as above: a `saved` state passed as `defaultValues`, that
  follows `binding.baseline` (it becomes the stored record with `binding.reset(stored)`, the server version
  with a rebase). The summary and the save bar don't need it (they come from `useChangeSummary`, never from
  TanStack Form's `isDefaultValue` or `isDirty`), but TanStack Form's own view then agrees with them:
  `isDefaultValue` is `true` on the saved and rebased fields, and `form.reset()` is a real discard, back to
  the record the server has. Follow the baseline rather than setting `saved` where you call
  `rebase(incoming)`: a rebase called during a save is queued, and `incoming` as `defaultValues` before it is
  applied is a rehydration that wins over the save (the edits typed during the save are lost, see
  [Saving](#saving-1)).
- `binding.values` / `binding.baseline` are immutable snapshots: a new object only when the content changes,
  the same object across renders that change no value (a blur, a validation, a parent's state), so the
  summary is never stale and is not recomputed for nothing. TanStack Form keeps the object you pass as
  `defaultValues` (or to `form.reset(data)`) as its own values, without a copy: the binding keeps copies, so
  its baseline never changes under the summary if your code mutates that object later (TanStack Form itself
  would not see such a mutation either: don't mutate it).
- A `defaultValues` written **inline** (`useForm({ defaultValues: { ...record } })`, a new object at every
  render) is fine: an object with the same content is no change, no snapshot and no rehydration (the open
  conflicts stay open).
- Give every field its default in the `defaultValues` of `useForm` (`''` for an empty text input). A field
  with a `defaultValue` of its own only (on `form.Field`) enters `values` but not the baseline: it is listed
  as added.

### Hydration: `defaultValues` and `update()`

`useForm` calls TanStack Form's `formApi.update(opts)` at **every** render: the options you pass replace the
form's, its defaults included. So the baseline TanStack Form uses is always the `defaultValues` of your last
render, and the binding follows it:

- **Async load**: pass the loaded record as `defaultValues` (`useForm({ defaultValues: record ?? empty })`).
  While the form is not touched, TanStack Form takes the new values; the binding reads it as a rehydration:
  no summary row in any render, no field meta written (`isTouched`, `isBlurred`, `isDirty`), no
  `listeners.onChange` called, no validator run, and for `useFormRebase` the open conflicts are closed.
- **`form.reset(data)`** works the same way **only if `defaultValues` follows the data** (set the state you
  pass as `defaultValues` together with `form.reset(data)`). With a `defaultValues` that stays on the empty
  record, TanStack Form puts it back at the next render of the component (the binding makes the component
  render on every value change, so at once): no row is ever shown, but the data is gone.
- **`defaultValues` that changes on a TOUCHED form** (`FormApi.js:94`): TanStack Form keeps the values the
  user has, but compares them with the new defaults from now on. The binding does the same: the baseline
  becomes the new `defaultValues` (a rehydration: the open conflicts close), and the summary lists every
  field whose value differs from it, the user's edits and the fields the user never touched alike. The
  summary is never computed against a baseline TanStack Form no longer uses. To bring server data in while
  the user edits, use `rebase(data)` instead (below): it keeps the edits, takes the server value on the
  untouched fields and reports the conflicts.
- A new `defaultValues` with the content of the current baseline (an app that keeps `defaultValues` on the
  record it saved or rebased on) is no change for the binding.
- On a touched form, TanStack Form's `update()` takes new defaults without recomputing its field meta: its
  `isDefaultValue` would stay computed against the old defaults until the next change of the form. When the
  content of `defaultValues` changes, the binding has TanStack Form recompute it at once, with one update of
  its base store that keeps the values (no field meta written, no listener, no validator).

### Saving

- `binding.isSaving` is `form.state.isSubmitting`; `binding.saveError` is `null` unless the last submit did
  not succeed (blocked by validation, or an `onSubmit` that threw: then `form.state.errors`; TanStack Form
  does not keep the thrown error, pass `saveError` to expose it).
- Call `binding.reset(saved)` **inside** `onSubmit`, before it resolves: a server update that came during the
  save is queued (`isPending`) and merged against what was saved.
- The user can keep typing while the save is in flight: `reset(saved)` called during the save makes `saved`
  the baseline; a field edited since the save started keeps the typed value (in the summary), every other
  field takes the value the server stored, its normalization included. Nothing edited meanwhile: `values` is
  `saved` itself. The rows of an array are matched by id with
  `useTanStackFormBinding(form, { arrayIdKeys: { lineItems: 'id' } })` (the same `arrayIdKeys` you give the
  engines); without it, an array edited during the save is kept whole. A rehydration during the save wins.
- A submit that succeeds closes the open conflicts; one that fails (an `onSubmit` that rejects, a submit
  blocked by validation) leaves them open, and a queued update is merged anyway.
- A save that does not go through `form.handleSubmit()` (a mutation of your data layer): pass its state,
  `useTanStackFormBinding(form, { isSaving: mutation.isPending, saveError: mutation.error })`. Each option
  replaces its own mapping; pass both. Call `binding.reset(saved)` while `isSaving` is still `true`.

### Server updates: `rebase`

`rebase(incoming)` merges a newer version of the record into the user's draft: the fields the user did not
touch take the server value, the ones both changed keep the user's value and are listed in `conflicts`, to
resolve with `keepMine(path)` / `acceptTheirs(path)`. The engine calls `binding.reset(incoming)` then
`binding.setValues(merged)` in one batch; the binding writes each to TanStack Form in **one** update of its
base store (`form.baseStore.setState`), so:

- no field meta is written: a field the server changed is not touched, not blurred, not dirty; the user's
  fields keep their meta;
- no `listeners.onChange` is called and no validator runs on the server's values (no echo taken for a user
  gesture). The error of a field that takes another value is removed (it was about a value the field no
  longer has; validation runs again at the next change, blur or submit); an error stays on a field the
  rebase leaves as it was;
- no render shows `incoming` alone, nor the server value in the input the user edited;
- a top-level key the server removed is removed from `form.state.values` too;
- a `form.Field` in `mode="array"` renders the rows the server added or removed (its `_arrayVersion` is
  bumped, as TanStack Form's own array operations do);
- a write of yours after the binding's, in the same run, is applied by TanStack Form on top of it and wins.

The binding never writes TanStack Form's own defaults: `useForm` would put yours back at the next render,
and on a form not touched the values too. So after `binding.reset(saved)` or a rebase, TanStack Form's
`isDefaultValue` and its `form.reset()` refer to the `defaultValues` of `useForm`: keep them on the
binding's baseline (see [Usage](#usage-1)) and TanStack Form agrees, `isDefaultValue` is `true` on the
fields the server set and `form.reset()` is a real discard. With `defaultValues` left on an older record,
`isDefaultValue` is `false` on those fields and `form.reset()` goes back to that record: discard with
`binding.reset()` (back to the saved baseline).

### `useChangeSummary().isEmpty`, not `state.isDirty`

Drive the save bar and the dirty guard from `useChangeSummary().isEmpty` (and `reorders.length === 0` with
`arrayIdKeys`), never from TanStack Form's `form.state.isDirty`. TanStack Form's dirty is **persistent**: a
field the user changed stays dirty after being typed back to its saved value (its `isDefaultValue` is `true`
again), while the summary drops its row. The two also differ after a rebase or a save, when `defaultValues`
is not kept on the record (see above). The summary is what the user reads.

### What the adapter reads

The object `useForm` returns is a copy of TanStack Form's `FormApi` made at the first render: its methods are
the instance's, but its `options` stay those of the first render, while TanStack Form replaces the
instance's at every render. No public API returns the instance, so the adapter calls `form.Subscribe` once as
a plain function (it renders TanStack Form's subscriber with the instance as its `form` prop: no hook, no
side effect) and reads the live `defaultValues` there, checked by the identity of `form.store`. After a change
of content of `defaultValues` it writes `form.baseStore` once with the same values, so TanStack Form
recomputes its field meta (see [Hydration](#hydration-defaultvalues-and-update)). The tests of
`@formrail/pro` pin this and the TanStack Form behaviours above against the tested version
(`@tanstack/react-form` `1.33.5`, the minimum of the peer range `~1.33.5`, which accepts 1.33.x only: a newer minor
is a peer conflict at install time, not a silent change of behaviour); in development a form where it does not
hold gets a `console.warn`, and the baseline then follows only the `defaultValues` of the first render. In
production there is no warning (a hydration through `defaultValues` would then show as changes): this is why
the peer range stops at the tested minor. If you see that warning, or force an install outside the range, stay
on the last version that does not show it.

The adapter also relies on these behaviours of TanStack Form, all pinned by the tests on 1.33.5: the store
semantics of `baseStore.setState` (one notification, the derived stores recomputed), `fieldMeta._arrayVersion`
for the fields in `mode="array"`, and the copy of the `FormApi` that `useForm` returns.

Call `useTanStackFormBinding` in the component that calls `useForm`. In a child of it (a form passed as a prop,
`withForm` of `createFormHook`), the child's layout effects run before the parent's `formApi.update(opts)`: a
new `defaultValues` on a form the user touched (TanStack Form writes no state then) reaches the binding at its
passive effect, so for one painted frame the summary is computed against the previous baseline while TanStack
Form already compares with the new defaults. On a form not touched, `update()` writes the values and the
binding follows them at once.

## Change Summary engine

A field-by-field diff of the current `values` against the **real saved baseline**, as a
deterministic list of human-readable entries.

```ts
import { computeChangeSummary, useChangeSummary, inferSegmentLabel } from '@formrail/pro';
import type { ChangeEntry, ChangeKind, ChangeSummaryOptions, UseChangeSummaryReturn } from '@formrail/pro';
```

- `computeChangeSummary(options): ChangeEntry[]` — the pure function where all the logic lives.
- `useChangeSummary(options): { entries, isEmpty }` — the memoized hook (SSR-safe). `entries` keeps its
  identity while `values`/`baseline` keep theirs; `arrayIdKeys`/`labels` are compared by content
  (inline literals are fine), `isEqual` by identity (pass a stable function).
- `inferSegmentLabel(segment)` — the label inferred for one object key (`lineItems` → `Line Items`,
  `vatID` → `Vat ID`, `address2` → `Address 2`).

### Example

```tsx
import { useObjectPageForm } from '@formrail/core';
import { useChangeSummary } from '@formrail/pro';

function InvoiceChanges({ invoice }: { invoice: Invoice }) {
  const form = useObjectPageForm<Invoice>({ baseline: invoice });
  const { entries, isEmpty } = useChangeSummary({
    values: form.values,
    baseline: form.baseline, // the real saved baseline: after save() the summary is empty again
    arrayIdKeys: { lineItems: 'id' }, // match rows by id: a mere reorder is not a change
    labels: { 'supplier.vatNumber': 'VAT number' },
  });
  if (isEmpty) return <p>No changes</p>;
  return (
    <ul>
      {entries.map((entry, index) => (
        // kind + path alone can collide (a key containing a dot, `{ 'a.b': 1 }` vs `{ a: { b: 1 } }`):
        // the index makes the key unique within the list.
        <li key={`${index}:${entry.kind}:${entry.path}`}>
          {entry.label}: {entry.kind}
        </li>
      ))}
    </ul>
  );
}
```

With a row changed, one added without id, one removed and two rows swapped, `entries` is e.g.:

```ts
[
  { path: 'supplier.vatNumber', label: 'Supplier > VAT number', kind: 'changed', before: 'IT111', after: 'IT222', labelPath: ['Supplier', 'VAT number'] },
  { path: 'lineItems.0.price', label: 'Line Items > Item 1 > Price', kind: 'changed', before: 100, after: 120, labelPath: [/* ... */] },
  { path: 'lineItems.3', label: 'Line Items > Item 4', kind: 'added', before: undefined, after: { description: 'Cable', price: 5 }, labelPath: [/* ... */] },
  { path: 'lineItems.1', label: 'Line Items > Item 2', kind: 'removed', before: { id: 'b', /* ... */ }, after: undefined, labelPath: [/* ... */] },
]
```

### `ChangeEntry`

| Field | Meaning |
|---|---|
| `path` | Dot notation with numeric indexes, the same as core's `FieldErrors` (`lineItems.2.price`). Index in `values`, or in the baseline for a `removed` item. |
| `labelPath` | One label per segment: inferred, `Item N` (1-based) for array indexes, or the `labels` override. |
| `label` | `labelPath.join(' > ')`. |
| `kind` | `'added' \| 'removed' \| 'changed'`. |
| `before` / `after` | Baseline / current value; `before` is `undefined` for `added`, `after` is `undefined` for `removed` (even when that side was `null`). |
| `beforeMissing` / `afterMissing` | `true` when that side has no own key at this position, or no counterpart for an array item: tells a missing key from a key present with value `undefined`. |

### Rules (full reference in the TSDoc of `ChangeSummaryOptions`)

- `''`, `null`, `undefined` and a missing key are four distinct states, as for `isDirty` in
  `useObjectPageForm`: without `isEqual` and `arrayIdKeys`, `entries` is empty if and only if `isDirty`
  is `false`. Declaring `arrayIdKeys` adds two exceptions: a reorder without changes is dirty but gives no
  entry, and an item whose id is not matched by `Object.is` gives `added` + `removed` even against an equal
  one. The second covers items without id, ids that are objects (compared by reference: a cloned `Date` or
  object is another id) and `0` against `-0`.
- **Absent** = `undefined`, `null`, missing key: it only decides the kind of the entry. Both sides Absent
  → `changed` (`null` → `undefined`). One side Absent → one `added`/`removed` entry on the node, whatever
  the other side holds (`null` → `''` is `added`, `[]` → `null` is `removed`). Anything else is compared
  structurally; no other normalization (`' '` vs `''`, `5` vs `'5'` are changes).
- `NaN` equals `NaN`, `0` equals `-0`, `Date`s by `getTime()`; `Map`, `Set`, class instances and
  functions are leaves compared by reference. Circular structures are supported, and so are very deep
  ones: the visit is iterative (no call-stack overflow, tested at 10 000 levels). The cost is linear in the
  visited nodes, and a subtree shared by several paths is visited once per path, so a graph of shared
  subtrees can cost exponential time in its size.
- **Arrays**: declare an identity key per array path without indexes (`arrayIdKeys`, e.g.
  `{ lineItems: 'id', 'lineItems.taxes': 'code' }`) to get per-field entries for matched rows,
  `added`/`removed` per row and no entry for a reorder; `[]` against an Absent side has no row to report
  and is one entry on the array. Without it, an array is diffed as a block (one `changed` entry, even for
  a reorder). Duplicate ids degrade that array to the block diff with a development warning.
- **`isEqual(a, b, path)`**: custom equality, called before the default rules on every visited pair
  except the root (a missing key is passed as `undefined`). `true` → no entry for that subtree, `false`
  → one atomic entry, `undefined` → default. The subtree of an atomic entry is not visited.
- **Order**: depth-first; keys in the order of `values`, then baseline-only keys; id-matched arrays in
  the order of `values`, then the `removed` items in baseline order.

## `<ChangeSummary />`

An accessible, responsive list of the entries of the engine, to show in an Object Page before saving.

### Styles and import order

```ts
// once, at the root of your app: mode (a) of the core README ("Compiled stylesheet")
import '@formrail/core/styles.css'; // 1. core tokens (--*-rop-*) and utilities
import '@formrail/pro/styles.css'; //  2. pro component styles (consume the tokens, never redefine them)
```

`@formrail/core/theme.css` is not a third import: it is the Tailwind v4 source of the core's mode (b),
an alternative to the core `styles.css`, never loaded together with it (see the core README).

Pro's `styles.css` holds only its own `.rop-pro-*` component classes, never a Tailwind utility also
emitted by core, so it cannot override core's responsive variants: the result does not depend on the
order of the imports. Its rules are in the nested layer `rop.utilities.pro`, below core's utilities:
a core utility passed through `className` (`className="p-0"`) overrides the component's default, and
your un-layered CSS overrides both.

### Usage

```tsx
import { ChangeSummary, useChangeSummary } from '@formrail/pro';

const { entries } = useChangeSummary({ values: form.values, baseline: form.baseline });
<ChangeSummary entries={entries} locale="en-US" />;
```

- Props: `entries`, `renderValue?(value, entry)`, `emptyLabel` (`"No changes"`), `label` (accessible name of
  the list, `"Changes"`), `locale`, `timeZone`, `valueLabels` (`yes`, `no`, `empty`, `noValue`,
  `nullValue`, `undefinedValue`, `missingValue`, `invalidDate`, `added`, `removed`, `changed`, `from`, `to`, `contentsDiffer`, `items`), `className`
  (merged with `tailwind-merge`; a core utility wins over the component's default, see above), `ref`
  and other HTML attributes on the root.
- Text read by assistive technology: `Amount, changed, from 100 to 120`. The kind of change is visible
  text, never only colour. There is no live region: a summary that changes at every keystroke is not
  announced.
- Default formatting (`formatChangeValue`, also exported, pure): booleans `Yes`/`No`; dates with
  `Intl.DateTimeFormat` (`dateStyle: 'medium'`), `Invalid date` for invalid ones; numbers with
  `Intl.NumberFormat`; `''` is `Empty`, `null`/`undefined` is `No value`; arrays `N items`; plain objects
  a compact `Label: value` list. If before and after would look identical, both are re-rendered
  precisely (time, ISO string, full number with `n` for a bigint, quoted string, `Null` / `Undefined` /
  `Missing` for the no-value states, never `from No value to No value`), then with their contents written
  out (`["a", "b"]` / `["a", "c"]`, `{a: {x: 1}}`, `Map {"k" => 1}`, truncated to 120
  characters); if even that matches (two class instances), the after side ends with
  `(contents differ)`. `formatChangeValue` never throws (revoked Proxy, throwing traps or getters give
  `Unsupported value`).
- `renderValue` is called once for each value shown (never for the missing side of `added`/`removed`).
  Returning `null` leaves the value empty. An exception thrown by `renderValue` propagates.
- To delegate the values you do not handle, use `formatChangeValue(value, { precise: true })`: the compact
  rendering gives `No value` for both `null` and `undefined`, so `null` → `undefined` would read
  `from No value to No value`. `precise` also quotes strings and adds the time to dates.
- A missing key reaches `renderValue` as `undefined`. On `undefined` against a missing key both calls get
  the same arguments (`undefined` and the same entry), so `beforeMissing` / `afterMissing` do not tell which
  side is being rendered, and a delegate shows `Undefined` on both. The default rendering has no such
  limit: to keep it, leave `renderValue` unset or build your own list on `useChangeSummary`.
