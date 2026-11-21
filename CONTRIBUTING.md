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
  interface (`ListReportFrameLabels extends ListReportTableLabels`) is documented once, where it is declared. A default
  that is a whole sentence with punctuation goes in double quotes (`Default "You have unsaved changes: ..."`), because
  the type reference would otherwise take it for an expression.
- A key has **no `@default`** (it would be the mixed form, and the Docs would not show it anyway).

The same CI job fails on `label-no-default` (a key whose prose states no default: a new label without its default),
`label-mixed` (`@default` and prose on one key) and `label-tag` (`@default` alone). It reads the exported types whose
name ends in `Labels`; a label type with another name is not seen. Two different declarations of one interface name
(say in core and in pro) fail as `label-collision`: rename one. Declared limits, not detected: keys of a
`Record<'a' | 'b', string>` are not read (write an interface); an inline object type such as `ObjectPage`'s
`labels?: { anchorBar?: string }` is not an exported `*Labels` type, so it is outside the guard (its keys state their
default in the prose by hand). If the docgen one day expands the keys into rows with
their own Default column, the e2e test fails and the convention flips to `@default` per key (option (a) of #540).

The guard checks that the prose states a default, not that it is **true**: the unit tests do (#549).
`packages/core/src/label-defaults.test.tsx` (core keys) and `packages/pro/src/label-defaults.test.tsx` (Pro keys)
take every key the guard reads (`measureLabels`) and compare **every value** its prose states with the value of the
code, through the generic `checkLabelDefaults` of `packages/core/test/label-defaults.ts`. Each file lists one or more
**sources** per interface in `labelSources()`: the component's `DEFAULT_LABELS` (exported from its module with
`@internal`, never from the package entry), or the texts read from a rendering when the default is not in a constant.
A function key is called with the placeholders of its prose (`Select <row label>` is `selectRow('<row label>')`) or,
when the prose is an example ("Default `1 item selected`"), with the arguments given in `examples`
(`{ selectedCount: { args: [1] } }`).

A prose that **lists** several values (the quoted values after the default, joined by `,`, `and`, `or` or `/`:
"Default `Information`, `Success`, `Warning` and `Error`, by tone.", "Default: `No items`, `1 item`, `N items`.") is
compared value by value, in order and in number (`proseDefaultsOf` of the guard reads the list; the list ends at the
first text that is not a separator and a quoted value, so "the number formatted in the `locale`" is not a value). The
source gives one example per value (`{ items: [{ args: [0] }, { args: [1] }, { args: ['N'] }] }`), an object of texts
compared member by member (`ToastLabels.tones` against `TONE_LABEL`), or an array of rendered texts, one per state
("No items selected", "3 selected", "1,234 selected (2 hidden by filters)"). A list the source cannot give in full
(one text, one example, an array of another length) fails: it never passes on its first value. Prose outside that list
(an example in the description, "e.g. `Close`", a sentence after `;`) is not compared.

A new interface or key without a source fails ("no source of the real value"); a key that really cannot be verified goes
in `LABEL_EXCEPTIONS`, with the reason (empty today).

## Demo data

Stories, examples, tests and e2e scenarios need believable data. Epic #512 moves them from a single domain
(supplier invoices, "Rossi Construction Ltd", `FT-2026-0001`) to a shared, multi-domain demo universe.

**Where the fixtures are.** `packages/core/src/internal/demo-data/`: one fictional company with its staff, customers,
suppliers, products, sales and purchase orders, support cases and documents, generated deterministically
(`makeCustomers(n)`, `makeEmployees(n)`, ...; the contract is at the top of `index.ts`). It is story-only: not exported
by `src/index.ts` nor by the `/internal` facade, never in `dist`. Library code (`packages/*/src`, outside stories, tests,
`showcase/` and `internal/demo-data/` itself) must not import it: ESLint fails the build (ticket #515).

**Neutral components, domain only in declared examples.** A component does not belong to a domain. Its Docs page explains
it on a generic record first; a domain appears afterwards, as an example that says so (rules agreed on 21/11/2026).

1. **Neutral first.** The copy-paste story (`*.example.tsx`), the Playground and every public story that is not a
   `use-case` use generic data and labels ("Record", "Item", "Name", "Status", "Amount", "Owner", "Date"), from the
   neutral dataset of `demo-data` or inline (a copy-paste example cannot import internal modules: what the reader copies
   must run in their project, so its data is short and inline).
2. **Examples are declared.** A domain appears only in a `use-case` story: tag `use-case` and exactly one
   `vertical:<id>` tag (`erp`, `b2b`, `e-commerce`, `e-learning`, `helpdesk`, `hr`), name `Example: configured for ...`,
   at the bottom of the file, after at least one neutral story. Write the tags literally on the story (Storybook's
   indexer reads tags statically) and spread `useCaseStory({ vertical, problem?, configuration? })` from
   `packages/core/src/internal/story-example.ts`, which returns the description only (`parameters`, never `tags`):
   `{ name: 'Example: configured for ...', tags: ['use-case', 'vertical:erp'], args, ...useCaseStory({ vertical: 'erp', ... }) }`.
   That description replaces the story's JSDoc, so a use case has none. The page template shows these stories last,
   after every other one, under "Examples" (Free) or "Use cases" (Pro, title `Pro/...`), with a fixed introductory
   sentence; the rest of the page renders exactly as it would without them (on a page without a copy-paste example,
   Storybook's own template, "Stories" list and single-story rule included).
   **Limit:** a story is recognised by its tag and by the exact prefix `Example: ` (capital E, colon, space). A name
   written another way (`example: ...`, `Example - ...`, `Examples: ...`) on a story without the tag is not caught by
   the guard and stays among the neutral stories: use the exact prefix.
3. **Never in the library.** No domain in props, types, names, defaults, runtime messages or code of the library. In
   TSDoc the sentence that teaches a rule is neutral; an example with a real record is introduced by "e.g." and varies
   the vertical.
4. **Pro.** The "Use cases" section is mandatory on every Pro component or engine page: at least 3 distinct verticals,
   and each use case describes the concrete `**Problem.**` it solves and its `**Configuration.**`, both non-empty, in the
   story description.
5. **Verticals and their `demo-data` entities.**

   | Vertical | Entities of `demo-data` |
   | --- | --- |
   | ERP (`erp`) | sales and purchase orders, invoices, suppliers, stock |
   | B2B (`b2b`) | customers, price lists (from the per-currency prices of the products) |
   | E-commerce (`e-commerce`) | product catalogue, carts |
   | E-learning (`e-learning`) | courses, enrolments |
   | Helpdesk (`helpdesk`) | support tickets |
   | HR (`hr`) | employees |

6. **Exceptions.** The showcases (`Showcase/*`, `Pro/Showcase/*`) are reference applications, with their domain declared in
   the title; the unit tests of the engines use test data, not demo data.

**English only** in every visible string of a story or fixture.

**The use-case guard.** `e2e/docs-use-cases.spec.ts` runs `auditUseCaseStructure` and `auditProRatchet`
(`packages/core/src/internal/use-case-guard.ts`, with negative unit tests for every rule) on the `index.json` of the
build. It fails, naming the story, when: a `use-case` story is not named `Example: ...` or has no (or more than one)
`vertical:<id>` tag, or an unknown id; a public story named `Example: ...` is not a `use-case`; a `use-case` story comes
before a story that is not one on the same page, or a page has no neutral story before its first use case; a page with
`n` public use cases has fewer than `min(n, 3)` distinct verticals; a Pro use case lacks `**Problem.**` or
`**Configuration.**`. (On a page made only of `internal` fixtures every story counts as visible.) It also loads every
story and fails on a page whose `use-case`/`vertical:*` tags at runtime differ from the ones in `index.json`. The Pro
ratchet (`PRO_USE_CASES_PENDING`) lists the Pro pages that do not have their 3 verticals yet: a new Pro page outside
it must comply, a page that complies must be removed from it, and an entry that matches no page fails. Fixtures:
`Internal/DocsUseCases` (a page with a copy-paste example), `Internal/DocsUseCasesPlain` and
`Internal/DocsUseCasesSingle` (pages without one, each compared with its twin without use cases,
`...PlainNeutral` and `...SingleNeutral`); the Pro branch of the template is covered by unit tests (no internal
fixture may reach the public Pro demo).

**The legacy-data guard.** Until the migration ends (ticket #532) the old strings still exist in many files.
`npm run legacy-demo:check` (part of `npm run test:unit`, so of `npm run check` and of the CI job `unit test`) is a
ratchet: it counts them per file (the whole supplier names of the old fixtures such as `Rossi Construction Ltd`, `Acme`, `Northwind`,
the `FT-2026-` prefix when not glued to a preceding letter, digit or underscore (`XFT-2026-1` does not count), imports of `demo-invoices` and `demo-rows`; case-insensitive, whole words, comments included) in
`packages/*/src`, `e2e`, `.storybook`, `site-root` and the READMEs, and compares the count with
[`scripts/legacy-demo-data.baseline.json`](scripts/legacy-demo-data.baseline.json). `.changeset/*.md` and
`CHANGELOG.md` are history and are not scanned.

- A file outside the baseline with a legacy string, or a count that grows, fails: use another domain. The message quotes a sample of the matches with their original case.
- A count that goes down passes and suggests `npm run legacy-demo:update`; commit the new baseline.
- `legacy-demo:update` only lowers: it never raises a count nor adds a file. A renamed file shows up as a new one:
  `update` accepts it only if the total does not grow, so the occurrences just move.
