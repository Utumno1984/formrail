---
name: storybook-and-wcag-review
description: WCAG and QA checklist for Storybook stories (Primitives, Forms, Floorplans) — use it every time you write or modify a story, before opening or updating a PR.
---

# Storybook and WCAG review

Applies to every story in `Primitives/*`, `Forms/*`, `Floorplans/*` (not to the internal
fixtures of `Internal/Harness`, which are not published and do not follow this checklist).

## WCAG check

Every time you work on a component or on its story, check:

- **`aria-live` regions**: announcements of loading, errors and dynamic count changes (e.g. the
  result count of `ListReportTable`) are really inside a live region, with `role`/`aria-live`
  consistent with the urgency (`polite` for counts, `assertive`/`alert` for blocking errors) —
  and they fire only once per observable change, not on every render.
- **`:focus-visible`**: every new interactive element has a focus indicator visible only from
  the keyboard (never on click, the same `focus-visible:` convention already used on
  `Button`/`Field`), with non-text contrast ≥3:1 (WCAG 1.4.11) against the background it can
  actually fall on.
- No axe violation on the story (the e2e harness already checks it via
  `expectNoA11yViolations`): a new story must go through it, not be excluded from it.

## Optical QA

A check "by eye" or an already green visual baseline is not enough to catch a polish defect:
visual regression only compares against a previous screenshot, which may already contain the
defect. For every component with text in a fixed-height box (buttons, pills/chips, badges, tabs)
or with adjacent elements (label/control, border/content, two controls side by side), measure
with a Playwright script against Storybook (`getBoundingClientRect`, never a visual reading or a
screenshot):

- **Vertical centring of the text** in its box (a gap ≤ 1px between the space above and below
  the measured text, unless a different value is declared in the design — not "it looks
  centred").
- **Minimum distance between adjacent elements** compared with the one declared in the design
  (no real overlap measured) — the `:focus-visible` ring of a control counts as an element that
  can touch the one above/beside it, check it with focus active too.

Three real cases that this rule should have caught before they reached the maintainer: a story's
demo frame without padding overlapping the content; the focus ring of `Input` touching the label
above it (measured gap: 0px); the text of a `ListReportFilterBar` pill not optically centred,
because the treatment already applied to `Button` (`TextLabel` wrapper, line-height 1 + a 1px
optical offset, commit `5cb1df1`) had not been extended to the pill.

The measurement script can stay temporary (outside the repository, or deleted at the end of the
work); if the check must stay permanent, promote it to a real e2e test in `e2e/`.

## Tests and QA

Before opening or updating a PR:

- `npm run check` green (lint + types + build + unit).
- The e2e tests touched by the change green locally; the complete e2e suite is run by CI, which
  must be green. If the component has a wide impact (overlay, List Report, Object Page), the
  visual snapshot is updated and the complete visual suite is also left to CI.
- No temporary debug file (ad-hoc scripts, trial screenshots, test branches/PRs) remains in the
  repository or on GitHub at the end of the work: clean up before delivering, consistent with the
  convention already used for live smoke tests in `CLAUDE.md`.
