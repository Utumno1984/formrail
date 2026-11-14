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
