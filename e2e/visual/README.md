# Visual regression

Every Storybook story tagged `visual` is photographed by Playwright (`toHaveScreenshot`) at three
fixed viewports and compared with a baseline versioned in `e2e/visual/__screenshots__/`:

| Project         | Viewport   |
| --------------- | ---------- |
| `visual-mobile` | 375 x 667  |
| `visual-tablet` | 768 x 1024 |
| `visual-desktop`| 1280 x 800 |

Tests are generated from the static Storybook `index.json` (`visual.spec.ts`): to add a story to
the gate, tag it `tags: ['visual']`. Untagged stories are not photographed.

**Docs/MDX pages can be photographed too**: tag the page `<Meta ... tags={['visual-docs']} />` (the Introduction is; autodocs pages
are not photographed even though they inherit the `visual` tag of their stories).
Live demos rendered inline in a Docs page can inherit Storybook's Docs CSS; they are wrapped in `sb-unstyled`
(`DemoFrame`). The screenshot catches layout problems (double scroll, a clipped demo or focus ring) and
`e2e/introduction-style-parity.spec.ts` compares their computed style with the same component in the canvas
(ticket #286): the two checks complement each other. A new inline demo must go through
`<DemoFrame name="...">`: `name` becomes the unique `data-testid="demo-frame-<name>"`, so target a frame by
that id, never with a shared id plus extra disambiguating selectors. Then add a probe to the parity test.
The Docs screenshot waits for the `list-report` and `field-states` frames: keep those names in `visual.spec.ts`
in sync if they change.

## Commands

```bash
npm run test:visual          # compare against the baselines (needs Docker)
npm run test:visual:update   # (re)generate baselines (needs Docker)
```

Both run inside the official Playwright image (`mcr.microsoft.com/playwright:v<version>-noble`,
version = the exact `@playwright/test` version), pinned by **digest** (`@sha256:...`, because a tag
on MCR is mutable and a silent rebuild could change the rendering), the same image used by the
`visual` CI job: baselines are only valid if generated and compared in the same environment.
Without Docker the scripts fail with an explicit message; they never fall back to the local browser.

Writing baselines outside the container is blocked: the Docker script sets `VISUAL_DOCKER=1` and
`visual.spec.ts` fails with a clear message if `--update-snapshots` / `-u` is used without it, so
`npx playwright test --project=visual-* -u` on the host writes nothing.

A missing baseline is a **failure** (in CI and locally): baselines are created only by
`test:visual:update`, never implicitly.

## Renaming a story tagged `visual`: remove the old PNGs

Baselines are named after the story id (`<id>.png`, in each `visual-*` folder). When a story changes id,
`test:visual:update` writes the new PNG and leaves the old one: a dead file that looks like coverage.
`npm run test:visual:orphans` (a step of the `visual` CI job, after the screenshots, on the Storybook it
built) fails listing every PNG with no `visual` story or `visual-docs` page of that id, and prints the
`git rm ...` to remove them. Locally, run it after `npm run build-storybook`. The filter is the one of
`visual.spec.ts` (`visual-stories.mjs`); the PNGs of `landing.spec.ts` (`landing`, `teams`, `privacy`) are known
explicitly. It reads the complete build (Free + Pro stories); a story left out of it must be passed with
another `--index <path>/index.json` (several are merged). A missing index is an error, not "no orphans".

## When a check fails

Failing screenshots produce `*-expected.png`, `*-actual.png` and `*-diff.png` in `test-results/`
(in CI: the `visual-diff` artifact of the workflow run). Open the diff image to see the area.

## Updating a baseline

1. Run `npm run test:visual:update` and look at the changed PNGs in `git diff`.
2. Commit them together with the change that caused them.
3. **Motivate it in the PR description.** Updating a baseline is a change of the expected value,
   so it follows the regression rule in `CLAUDE.md`: it is never done just to make the check pass.

If you bump `@playwright/test`, update **together**: the exact version in `package.json`, the digest
(`PLAYWRIGHT_IMAGE_DIGEST` in `scripts/visual-docker.mjs`, how to read it is in the comment there)
and the `image:` in `.github/workflows/ci.yml`, then regenerate all baselines (a unit test fails
if the pin, the lockfile, the digest and the CI image disagree).

**Orphan baselines.** `--update-snapshots=changed` (what `test:visual:update` uses) only writes
changed or missing PNGs; it never deletes the baseline of a story that was removed, untagged or
renamed. Delete those files in `e2e/visual/__screenshots__/` by hand in the same PR.

## Per-story options and portals

By default the screenshot is of the **full scrollable page**, not just `#storybook-root`, so tall
components (Object Page...) are photographed below the fold and overlays rendered in a portal on
`document.body` (Dialog, Popover, Select...) are included. Opt-out tag:

- `visual-viewport-only`: capture only the viewport (e.g. a fixed-position overlay story where the
  scrollable page is irrelevant). See `Internal/Harness` (`Visual` vs `VisualViewportOnly`).

A story that throws or renders nothing fails the test with the render error (via `gotoStory`);
the Storybook error page is never photographed. Animations, transitions and the caret are
disabled and `document.fonts.ready` is awaited before each shot. Tolerance is declared in
`playwright.config.ts`: `maxDiffPixels: 10` absorbs sub-pixel anti-aliasing noise, and
`threshold: 0.1` (per-pixel YIQ colour distance, 0 = exact, 1 = anything) deliberately ignores
very small colour differences (e.g. `#1a56db` vs `#1a57db`) that come from rasterization, not from
a design change. The trade-off: a change of a few units in one colour channel is NOT detected;
real changes (layout, spacing, size, a visibly different colour) are. Lower it only together with
regenerated baselines.

Visual projects run with `retries: 0`, so a flaky screenshot fails the job instead of passing on
a second try. `npm run test:e2e` excludes every `visual-*` project by name pattern
(`E2E_EXCLUDE_VISUAL=1`, see `playwright.config.ts`), so new projects are included automatically.

The story list is read from `storybook-static/index.json` on disk when the spec file is loaded
(no server and no port involved), so `playwright test --list` and IDE integrations are instant;
build Storybook first (`npm run build-storybook`) if the folder does not exist.

## Geometry assertions

`e2e/helpers/geometry.ts` offers layout assertions for functional e2e specs:
`expectSingleScroller`, `expectNoHorizontalOverflow`, `expectFocusRingVisible`. They are
self-tested in `e2e/geometry.spec.ts` against the healthy/broken stories of
`Internal/GeometryFixtures`.

- `expectSingleScroller` counts the page (`document.scrollingElement`) as a scroller too.
- `expectNoHorizontalOverflow` ignores the part of a descendant clipped by an intermediate
  `overflow-x` wrapper (scrollable table, ellipsis cell) and elements parked entirely off-screen
  to the left (`left: -9999px`); real overflow is still reported.
- `expectFocusRingVisible` compares the focused and unfocused styles (a permanent shadow or a
  transparent outline is not an indicator) and disables transitions while measuring.
