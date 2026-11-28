# Formrail — contributor guide for AI-assisted work

Formrail (until 2026-11-11 `react-object-page`: GitHub repository, npm `@react-object-page/core`,
Storybook; rebrand in ticket #428) is an **open-core** React design system: a headless,
independent implementation of two widespread enterprise UI patterns — **List Report** (a list
with filters and bulk actions) and **Object Page** (an editor with anchored sections, a sticky
save bar and a dirty guard). No third-party code, assets or CSS are touched: only generic,
freely implementable interaction and composition patterns, described in the abstract (see
`docs/planning/design-system-spec.md`).

**Business model — open-core**:
- `packages/core`: MIT, free, published on the public npm registry. Primitives and "simple"
  versions of the floorplans (see the segmentation in `docs/planning/design-system-spec.md`, §3).
- `packages/pro`: commercial licence ("to be defined"), **lives in this public monorepo**
  (maintainer decision, 2026-11-03: the source is readable, the moat is service and licence),
  with `"private": true` until the package is published on GitHub Packages (no runtime
  licensing). It is extended only through explicit tickets (MVP roadmap, §6). **Commercial plan
  (maintainer decisions, 2026-11-13, replacing "recurring subscription"; not to be renegotiated
  without a new maintainer instruction; details in `docs/planning/design-system-spec.md` §8)**:
  target: company teams (ERP, business management software, admin portals); a per-developer
  licence with a one-time payment, with 12 months of updates included and use with no time limit of the
  versions received (perpetual licence for the versions received) (maintainer decision, 2026-11-26), sold through a Merchant of Record,
  **Paddle** (maintainer decision, 2026-11-26: Lemon Squeezy does not accept new sign-ups and
  closes on 2027-03-31; source in spec §8, point 4), which handles EU VAT and invoicing. Before
  pushing sales: a landing page with a waiting list / pre-order (demand validation), ticket #490.
  Study/refactoring ticket #489 to make the Pro engines (Change Summary, Form Rebase) decouplable
  from `@formrail/core`, for teams that use React Hook Form or TanStack Form. **Distribution
  (maintainer decision, 2026-11-26)**: GitHub Packages, dedicated GitHub organisation
  `formrail-dev`, package `@formrail-dev/pro` installed through an npm alias (`@formrail/pro`);
  it replaces the private npm organisation (superseded: private npm packages are paid, and no
  fixed cost is allowed), no runtime licensing. Details in §2.4 and §8.
- The complete planning document (component inventory, general-class technical pitfalls,
  Free/Pro segmentation, MVP) is `docs/planning/design-system-spec.md`. **The planner always
  reads it before creating tickets.**

## Role of the coordinating session: coordinating the project team

The maintainer works directly with the session opened in this repository (maintainer decision,
2026-11-12). Whoever works in this repository (interactive or headless session) coordinates the
team in `.claude/agents/`; in this guide that session is called the **coordinating session**.
For every request, follow the pipeline without skipping steps:

1. **planner** → creates the GitHub tickets (or returns questions: forward them to the
   maintainer and wait).
2. For each ticket, in dependency order:
   1. **developer** → branch `feat/<N>-<slug>` (or `fix/<N>-<slug>`) and **a draft PR right
      away** (`Closes #<N>`), so CI runs on every push. Code and tests together: unit tests
      (Vitest), **e2e for every externally visible behaviour** (Playwright, against Storybook or
      a minimal test page). `npm run check` green.
   2. **Green CI** on the PR (`gh pr checks <N> --watch`): lint, types, build, unit tests, e2e.
      If it is red, the PR goes back to the developer: the tester and the adversarial reviewer
      do not start on red CI.
   3. **tester** → QA: every behaviour in the ticket from the point of view of a library user,
      smoke test on the build (static Storybook and/or the published bundle), uncovered cases.
   4. **adversarial-reviewer** → red team of the diff, last, on code that is already green and
      verified.
   5. If the tester or the adversarial reviewer report problems, go back to the **developer**
      with the complete list and restart from step 2 (CI). **Limit (maintainer decision,
      2026-11-12)**: after **2 rejections by the adversarial-reviewer**, or after **2 rejections
      by the tester**, on the same ticket, stop and ask the maintainer; work resumes only on
      their instruction. How to count:
      - the two counts are separate (2 for the adversarial reviewer, 2 for the tester) and are
        not added together;
      - rejections are counted, not returns to the developer: it is an objective measure;
      - red CI is not a rejection: the PR goes back to the developer without entering the count;
      - the count is per ticket, not per PR: closing a PR and opening another one on the same
        ticket does not reset it;
      - a rejection also counts when it comes from a round restricted to the points raised in
        the previous round, and also when the problem found is new.
   6. When CI is green, tester = QA PASSED and adversarial reviewer = APPROVED: `gh pr ready <N>`
      and a summary (what changes, tests added, the adversarial reviewer's notes).
3. **Merge**: done by the coordinating session of this project, autonomously (maintainer
   delegation, 2026-11-12), only if: CI green, tester = QA PASSED, adversarial reviewer =
   APPROVED, no open question for the maintainer. Merge commit (not squash); stacked PRs in
   order, with the base of the next one moved back to `main`. The agents (`.claude/agents/`) and
   the delegated headless sessions never merge. No direct pushes to `main` and no force pushes.
4. **Version and npm publishing**: the version bump of a PR that touches `package.json` is
   decided by the session coordinating the pipeline (maintainer decision, 2026-11-12), never by
   one of the agents in `.claude/agents/`. Publishing is not part of the merge delegation: no
   `npm publish` without an explicit instruction from the maintainer.

### Language of everything published on GitHub

Anything published on GitHub (issues, PRs, comments, commit messages) is written in English,
neutral and outward-facing: no personal names, no internal roles (planner, developer, tester,
adversarial reviewer, coordinating session), no round counters, no model names. The tool
attribution added automatically (the "Generated with Claude Code" line in a PR description, the
`Co-Authored-By` trailer of a commit) is allowed. Reports to the coordinating session, which are
not published, stay in Italian.

### `gh` commands

`gh` is on the `PATH`: call it as `gh ...`, at the start of the command and on its own (no
`PATH=...` prefix, no `cd ... && gh`). Otherwise the command does not match the `Bash(gh *)`
permission in `.claude/settings.json` and stays blocked waiting for an approval.

If `gh issue create`/`gh pr create` are blocked in a headless session (the auto-mode
"self-approval" classifier, not a syntax or permission problem): write the content into a local
file (e.g. `.tickets-draft/<name>.md`, already in `.gitignore`) and return it to the coordinating
session, which publishes it itself with `gh issue create --body-file`.

### Model choice by the intellectual load of the task (maintainer decision, 2026-11-01)

No strict quota constraint any more: the model is not chosen to save tokens but by the
intellectual load of the individual task. `sonnet` and `opus` remain the starting points per role
(developer/tester `sonnet`, planner/adversarial reviewer `opus`), but they are priorities, not
rigid rules:

- **Raise to opus** when the task touches focus management/accessibility, non-trivial state
  logic, real ambiguity, or a serious red team — also for the developer or the tester if the
  ticket requires it.
- **Drop to sonnet** when the task is mechanical, well specified and low risk (visual polish, a
  story, an isolated fix already diagnosed) — the pattern already used for the adversarial
  reviewer ("adversarial reviewer: sonnet, low risk", with the reason stated) thus applies to any
  agent.
- Headless sessions (`claude -p`): `--model sonnet` by default (coordination/rebase/CI-watch is
  mechanical), but consider `opus` if the ticket itself is high risk.
- Document a non-obvious choice in the launch prompt (one line: model and reason). Not on the
  ticket: model names are not published on GitHub (see "Language of everything published on
  GitHub").
- Parallel work (several worktrees, several independent tickets) is fine by default — the real
  constraint is the hardware (CPU/Chromium in parallel), not the quota. Before launching heavy
  steps (e2e, visual, build) in parallel, check `uptime`: if the load is already high, queue the
  work (above 8, always wait), and never ignore an anomalous result.
- **Maintainer decision (2026-11-27)**: machine load.
  - Locally, run only the tests touched by the change. Do not run the complete e2e and visual
    suites locally: CI is authoritative for them. The only exception is
    `npm run test:visual:update`, which may run locally solely when there are new or changed
    baselines to generate, with `uptime` below 8, shutting the containers down at the end; the
    visual comparison itself stays in CI. This does not relax `npm run check`, which stays
    mandatory before every commit.
  - Before a heavy step (Storybook build, e2e, visual, Docker), check `uptime`. If the load is
    above 8, wait instead of adding more work.
  - Every agent always shuts down the servers and background processes it has left running.

**Priority and pace (maintainer decision, 2026-11-04, replacing "slow pace / not a
priority")**: Formrail is now a **priority** project, no longer a slow-paced side project.
Proceed ticket by ticket without stopping at every single step, unless there is a real decision
to ask the maintainer.

## Regression and tests

- Existing tests are not deleted, renamed or weakened (no `.skip`, `.only`, `.fixme`, removed
  assertions, widened thresholds or timeouts, changed expected values) to make a PR pass: if a
  test is wrong, explain it in the PR.
- Every ticket has a "## Smoke test" section in addition to the acceptance criteria.
- **Visual regression (Storybook + screenshot diff) from the first component**, not added later:
  a functional e2e test is blind to layout (centring, double scroll, a clipped focus ring can all
  be "green" with a real visual bug).

## Domain rules (general principles, see `docs/planning/design-system-spec.md` §1 for the details)

- **List Report**: a dimensionally stable footprint across loading/empty/data (no layout
  shifts); an explicit, tested contract for sorting on the first click; virtualisation explicitly
  disabled on small/empty datasets; truncated cells with a real `max-width` on the container (not
  just `text-overflow`); the truncation tooltip gated on real hover/focus, never on mount; actions
  in an overflow menu must inherit `onClick`/`disabled` from the original component.
- **Object Page / dirty-tracking (probably the core of the technical moat)**: a control that
  receives its value from outside after mount (asynchronous hydration) must never mark the form
  as "dirty" nor propagate that event as a user gesture. Prefer mounting controls already
  hydrated; if the underlying library still emits an "echo" `onChange`, there must be an explicit
  way to tell a system echo from user intent. The Change Summary (diff) is always computed
  against the real saved baseline, never against a static default. Sticky footer: always reserve
  the space, even before it appears/disappears.
- **Fields with forced/locked/disabled states**: not interactive from the keyboard either, not
  just visually dimmed; the explanation linked through a real `aria-describedby`; the API must
  offer a render-prop/hook channel to inject those properties into an arbitrary child control (a
  plain `children: ReactNode` is not enough).
- **Responsive tablet/mobile (not a blocking gate, maintainer decision, 2026-10-25)**: real
  support, not a "use a desktop" message below a threshold (see
  `docs/planning/design-system-spec.md` §1.10). In particular: the **virtual keyboard** must be
  considered explicitly when a field gets focus (`visualViewport`/`dvh`, not just width media
  queries) — the active field must not stay hidden under the keyboard. It is an acceptance
  criterion of the Field/Dialog/Sheet tickets from the moment they are created, not a polishing
  ticket at the end of the project; visual regression (ticket #4) covers mobile/tablet viewports
  as well as desktop from the start.
- **Overlays (Dialog/Select/Popover/Tooltip/Sheet)**: a disciplined, consistent z-index scale
  across the whole system (popover always above modal); a real merge of conflicting classes
  (tailwind-merge, not concatenation); overlays "controlled by external state" must still trigger
  all the internal bookkeeping (overlay stack, focus trap, ARIA announcement), verified with the
  real DOM and not only by reading the code; focus return on close captured with a stable
  reference updated only while the overlay is closed; state-control properties that are not valid
  HTML attributes must be made non-enumerable before being spread onto the DOM (tested with a
  dedicated "no leak" assertion); prefer direct prop assignment over a conditional spread when the
  target is a component (it bypasses TypeScript's "excess property" check).
- **Motion**: any transition/animation (duration, easing, which properties to animate) is
  declared as a token (`--motion-rop-*` when a shared value exists), never as a literal value
  scattered in the component. Every motion token honours `@media (prefers-reduced-motion:
  reduce)`: with the preference active, the final effect (open/closed state, updated value)
  appears without a transition, not simply "faster". On an overlay, the animation must never
  change WHEN the focus trap activates or when `useReturnFocus` reads `document.activeElement` —
  see "Overlays" above: the same `Internal/OverlayLayers` and `Internal/ReturnFocus` tests stay
  green without any tolerance/timeout change.
- **Data layer**: a runtime validation schema shared between the form and the API call (it fails
  loudly on a missing field, it does not silently propagate `undefined`); asynchronous search
  with explicit tracking of the latest request (it discards responses from superseded requests);
  a selected value outside the results of the latest search stays visible.
- **Accessibility and tests**: the accessible name of a field must not change because of a state
  marker (e.g. "modified") in a way that breaks re-querying by label in tests — if needed, keep
  the reference to the node instead of querying it again. Two "functionally identical" controls
  with the same accessible name but different effects must be distinguished by name.
- **Governance**: a per-import bundle size budget compared against a versioned baseline (not
  rewritten on every run); a changeset is mandatory on every PR that touches `packages/*`; a
  primitive that introduces a behaviour change and the companion fix in a coupled consumer are
  released in the same release.

## Technical conventions

- Monorepo: `packages/core` (the only package existing at the start). `packages/pro` is created
  only when a ticket explicitly requires it (not before).
- Stack: React 18/19 + TypeScript, **headless** pattern (logic/state separated from styling,
  the same approach as react-virtual-tree-view/react-virtual-dnd-table). Build with `tsup`. Zod
  for the data-layer schemas. TanStack Query for caching/invalidation where a data layer is
  needed. Storybook for demos/documentation with visual regression active from the start. Vitest
  for unit tests, Playwright for e2e (including touch via CDP where relevant). Changesets for
  versioning/releases.
- Code, names and comments in English. **Storybook/demo text in English only (maintainer
  decision, 2026-11-01, replacing the old "Italian or English" rule)**: the product targets an
  international audience, so every string visible in a story (labels, placeholders, messages,
  fixture text) is in English, no longer mixed Italian/English. It applies from now on to new
  stories and to stories touched for other reasons; it does not require a systematic
  retroactive translation of all existing stories in one go (consider a dedicated ticket if it
  needs to be done organically).
- **Storybook: Controls/Actions/Interactions used for real, not as a formality (maintainer
  decision, 2026-10-25)**. For every component with a story that is not purely internal/fixture:
  `argTypes` that truly mirror the public API (the right control for the type — `radio`/`select`
  for a union of variants, not free text; sensible default values, not empty ones); callbacks
  (`onClick`, `onChange`, ...) wired with `fn()` so they show up in the Actions panel when the
  user interacts, not left unwired; a `play` function with the Interactions addon that scripts a
  realistic interaction (click, typing, opening an overlay) and checks the resulting state — not
  a symbolic gesture ("click once") but a case that both documents and proves a real behaviour of
  the component. The planner includes this in the acceptance criteria of every component ticket
  (from ticket #6 onwards); the adversarial reviewer checks that it was not added "just because"
  (controls that control nothing, an empty or trivial `play`).
- Tests: `npm run check` = lint + types + build + unit tests. Before every commit: `npm run
  check`. Before a ready PR: the tests touched by the change locally, and green CI, which runs
  the complete e2e suite.
- Secrets: none expected in the core (no external API, no database). If a need for
  licensing/keys arises for Pro, it is an architectural decision to bring to the maintainer
  (through the coordinating session) before implementing it, not to be invented on the spot.
