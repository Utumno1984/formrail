# @react-object-page/core

## 0.1.0

First public release.

`0.x` on purpose: the component set is complete for the Free tier and heavily tested, but there are no
external consumers yet, so the API may still settle with the first real feedback. Breaking changes, if
any, will be shipped as a minor bump until `1.0.0`.

### Styles and foundations

- Design tokens as CSS variables in the `rop` namespace (semantic colors, type scale, `sans`/`mono`
  families, radii, a disciplined z-index scale `sticky < overlay < modal < popover < toast < tooltip`,
  motion tokens that are switched off under `prefers-reduced-motion`).
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
  `Divider`, `Card`, `DescriptionList` / `DescriptionListStatus`, `TruncatedText`, `Tooltip`,
  `ToastProvider` / `useToast`.
- **Form controls**: `Field` (label, help, error, `required`, `disabled | forced | locked` states wired
  with real `aria-describedby`, on-screen keyboard aware), `Input`, `Checkbox`, `Switch`, `RadioGroup`,
  `Select`, `Combobox` / `useCombobox`, `Calendar`, `DatePicker`, `ValidationProvider`. Controlled
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
  errors), `useFocusFirstInvalidField`, `getErrorSummary` and `useDirtyGuard` (confirmation dialog
  for in-app navigation, `beforeunload` and browser Back/Forward).

### Notes

- Built-in fallback texts are in English; every label can be overridden through props.
- `@react-object-page/core/internal` exposes building blocks shared with the companion
  `@react-object-page/pro` package. It is **not public API** and has no semver guarantee.
- Peer dependencies: React 18 or 19 and `react-dom`. Runtime dependencies: Radix UI primitives,
  `clsx`, `tailwind-merge`.
- Live demo and documentation: https://utumno1984.github.io/react-object-page/
