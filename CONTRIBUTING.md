# Contributing

## Development workflow

See [`CLAUDE.md`](CLAUDE.md) for the development pipeline (planner → developer → tester → adversarial
reviewer) and the domain rules. The planning document is
[`docs/planning/design-system-spec.md`](docs/planning/design-system-spec.md).

Every PR that touches `packages/*` needs a changeset (`npx changeset`, see
[`.changeset/README.md`](.changeset/README.md)). Merging and publishing are done by the maintainer.

## Storybook and end-to-end tests

- **Public demo**: https://utumno1984.github.io/formrail/storybook/ is the Storybook of the
  core package only (Free). It is republished to GitHub Pages on every push to `main` with a green CI
  (job `deploy-pages` in `.github/workflows/ci.yml`; `workflow_dispatch` starts it manually). The site
  root is reserved for the landing page; until it exists it redirects to Storybook, and the old deep
  links (`/?path=/docs/...`, `/iframe.html?id=...`) keep working.
- The published site is assembled locally with
  `npm run build && STORYBOOK_EXCLUDE_PRO=1 npm run build-storybook && npm run assemble-site`
  (folder `site/`: root + `storybook/` + `pro/`); then `npm run serve-site` serves it at
  `http://localhost:6008/formrail/` and `npm run test:site` runs the pre-deploy smoke test
  (`e2e/site/`, outside the PR e2e suite).
- **Renaming a public story** (its title or its name, which changes its id): add the old id -> new id
  entry to the map in [`.storybook/legacy-story-ids.mjs`](.storybook/legacy-story-ids.mjs) **in the
  same PR**, one entry per id that changes, the Docs page (`<title>--docs`) included. Published links
  (`?path=/story/...`, `?path=/docs/...`, `iframe.html?id=...`) then land on the new story in the Free and
  Pro builds. The unit tests reject a cycle or a chain (point every old id straight at the final one); the
  e2e suites reject an old id that still exists and a new id that exists in no build.
- `npm run storybook` starts Storybook; `npm run test:e2e` rebuilds Storybook and runs Playwright
  against the static build on port 6007.
- Locally `reuseExistingServer` is on: if something already listens on port 6007, Playwright reuses it
  without rebuilding, so you may be testing an **old** build. If results look inconsistent, stop the
  process on 6007 and rerun.
- **Several git worktrees in parallel**: the port is configurable with `PLAYWRIGHT_PORT` (default
  6007). Without it two worktrees share 6007 and one may test the other's build. Give each worktree its
  own port, e.g. `PLAYWRIGHT_PORT=6107 npm run test:e2e`.
- In CI `retries: 1`: a flaky test that passes on the second attempt is reported as **flaky but green**.
  Check the report for tests marked flaky instead of trusting the colour alone.
- Tests tagged `@touch` only run in the `chromium-touch` Playwright project.

## The Default column of the props tables

Every public prop that has a default shows it in the **Default** column of the Docs, written as a `@default` tag in
its TSDoc. The CI job `default column` (`npm run default-column:check`, after `npm run build`) fails the PR when:

- a prop has a default in the source and no `@default`, or the tag differs from the source value;
- the prose of the description repeats the default ("Default `md`.", "`auto` (default): ...") next to a default the
  column already shows: say it once, in the column. A prop whose default is a behaviour, not a value, gets a
  `@default` stating the effective value (see `UNCOMPARABLE_ALLOWLIST` in `scripts/default-column-measure.mjs`; an
  entry there needs a reason and a test that reads the tag and compares it with the behaviour).

Known limit: the guard sees a default written in the destructuring of the props (parameter or body) or reached through
a delegation to an internal component. A new `prop ?? <literal>` fallback in the body with no `@default` is **not**
reported (today the only one is `FileUpload.defaultValue ?? []`): when you add one, write the `@default` yourself.
The prose reader (`proseDefaultOf`) takes a default stated in a sentence of its own for the prop; one stated in a
sentence that opens with a named key ("`anchorBar`: ... (default "Sections")") belongs to the key, not to the prop.
Two more limits of the prose reader, declared and not detected: a default written with a qualifier between the word and
the value ("Default (English): "Not specified".") and one written as a bare word ("Default secondary.") are not read as a
default, so a prose that repeats the column in one of those forms passes the guard. Write the prose without the default
(`DescriptionList.emptyLabel` was one of them, #540): the column says it.

### Label interfaces: the default is in the prose, once

The keys of a `*Labels` interface (`PaginationLabels`, `ListReportTableLabels`, `ListReportFrameLabels`,
`NumberInputLabels`, `ChangeSummaryValueLabels`, `RebaseNoticeLabels`, ...) follow the **opposite** rule of the props:

- A component shows its labels as **one row**, `labels` (type `Partial<XLabels>`), with an empty Default column and no
  row per key (checked on the built Storybook by `e2e/docs-props.spec.ts`). A `@default` on a key would be shown nowhere
  in the Docs; removing the prose would make the value disappear.
- So every key states its default **in the prose**, as a value: "Default `Previous page`.". A function says what it
  returns ("Default `Page ${page}`.", "Default: `No items`, `1 item`, `N items`."). A key inherited from another
  interface (`ListReportFrameLabels extends ListReportTableLabels`) is documented once, where it is declared.
- A key has **no `@default`** (it would be the mixed form, and the Docs would not show it anyway).

The same CI job fails on `label-no-default` (a key whose prose states no default: a new label without its default),
`label-mixed` (`@default` and prose on one key) and `label-tag` (`@default` alone). It reads the exported types whose
name ends in `Labels`; a label type with another name is not seen. If the docgen one day expands the keys into rows with
their own Default column, the e2e test fails and the convention flips to `@default` per key (option (a) of #540).
