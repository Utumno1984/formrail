# react-object-page

An **open-core** React design system: an independent, headless implementation of two widespread
enterprise UI patterns — the **List Report** (a list with filters, selection and bulk actions) and the
**Object Page** (a sectioned editor with an anchor bar, a sticky save bar and dirty-tracking) — for
teams that want that UX without a proprietary stack.

- **Home page**: https://utumno1984.github.io/react-object-page/
- **Live demo and documentation (Free)**: https://utumno1984.github.io/react-object-page/storybook/
- **Pro demo**: https://utumno1984.github.io/react-object-page/pro/

## Install

```bash
npm install @react-object-page/core
```

Peer dependencies: `react` and `react-dom` (18 or 19). See
[`packages/core/README.md`](packages/core/README.md) for the quick start and the styling options.

## Free and Pro

- **Free** (`@react-object-page/core`, [MIT](LICENSE)): typography and icons, `Button`, `Field` and the
  form controls (`Input`, `Checkbox`, `Switch`, `RadioGroup`, `Select`, `Combobox`, `Calendar`,
  `DatePicker`), overlays (`Dialog`, `Sheet`, `Menu`, `Tooltip`, `Toast`),
  `Tabs`/`Accordion`/`Breadcrumb`/`Pagination`, feedback (`MessageStrip`, `Spinner`, `Skeleton`...) and
  the simple versions of the **List Report** and **Object Page** floorplans (with `useObjectPageForm`
  and `useDirtyGuard`).
- **Pro** (`@react-object-page/pro`): components with a real technical moat (virtualization, advanced
  dirty-tracking, Change Summary, a dialog with an embedded grid). The package is private
  (`"private": true`, not published on npm) and has a **separate commercial license**
  ([`packages/pro/LICENSE`](packages/pro/LICENSE)); the source is readable in this repository, but the
  MIT license of the root covers `packages/core` only. See [`packages/pro/README.md`](packages/pro/README.md).

## Status

- The Free package is complete for the Free batch and is being prepared for its first npm release as
  `0.x`: the API may still settle after the first real-world feedback.
- Pro is in development and not published. Today it contains the Change Summary engine and component
  and the virtualized List Report; the rest of the Pro batch has not started and has no date.

The full plan (component inventory, Free/Pro split, architecture, roadmap) is in
[`docs/planning/design-system-spec.md`](docs/planning/design-system-spec.md).

## License

`packages/core` is [MIT](LICENSE) © Daniele Ingusci. `packages/pro` is under a separate commercial
license.

## Contributing

Development notes (workflow, running Storybook and the end-to-end tests locally) are in
[`CONTRIBUTING.md`](CONTRIBUTING.md).
