---
name: verify-and-merge
description: Procedure the Formrail coordinating session follows to verify a PR live and merge it — use it before every gh pr ready/merge. Agents and delegated headless sessions never merge.
---

# Verifying and merging a PR (coordinating session of the project only)

The merge is done by the coordinating session of this project (maintainer delegation,
2026-11-12, see CLAUDE.md, step 3 "Merge"); the agents in `.claude/agents/` and the delegated
headless sessions never merge. Follow this procedure when a PR is ready for the final review,
before `gh pr ready`/`gh pr merge`.

## 1. Isolated worktree, never the shared checkout

`<verify-dir>` is a scratch directory outside the repository, one per PR (for example
`<scratch>/formrail-verify-<N>`). From the main checkout of the repository:

```bash
git fetch origin <branch> --quiet
rm -rf <verify-dir>
git worktree add --detach <verify-dir> origin/<branch>
```

Never in the shared main checkout: it may have a headless session active on the same or another
branch.

## 2. `node_modules` via hardlinks

From the main checkout:

```bash
for d in node_modules packages/core/node_modules tests/react-18/node_modules; do
  rm -rf "<verify-dir>/$d"
  mkdir -p "$(dirname "<verify-dir>/$d")"
  cp -al "$d" "<verify-dir>/$d"
done
```

**Gotcha**: the `rm -rf` of the destination BEFORE the copy is mandatory — if the destination
already exists, `cp -al src dst` creates a nested `dst/basename(src)` instead of merging the
content (it happened twice on the `tests/react-18` sub-workspaces).

## 3. Static checks

```bash
cd <verify-dir>
npm run check          # lint + types + build + unit
npm run bundle:check
npm run changeset:check
```

All green before going on.

## 4. e2e and visual

```bash
npm run test:e2e     # in the background, wait for the notification
npm run test:visual  # requires Docker; if Docker has just been started (manually or by a
                     # local SessionStart hook), the actual start takes 30-60s — wait first
```

**Before running them alongside other heavy work on the same machine**, check `uptime`: two
complete Playwright suites (726 tests each) in parallel took ~7x the normal time out of pure
CPU/Chromium contention, not because of a code problem. Load well above the number of cores →
wait for it to drop or accept the slowdown knowingly, and never discard an anomalous result (too
slow, a number of tests much lower than usual) without checking the load.

**A single failed timing/animation test** (e.g. a CSS transition with a short-timeout
`waitForFunction`) under high load is often a false negative: run it again in isolation
(`npx playwright test <file> -g "<name>"`) once the load has dropped, before judging whether it
is a real bug.

**Known flake, not blocking**: any `*-inside-dialog` story in the visual suite (listbox/combobox/
select inside a Dialog) can fail with a ~1% pixel diff (text/border rendering) and pass on the
next attempt without any code change — it never blocks a merge on its own, but it must be
ticketed if it recurs (see issues #90, #111).

## 5. Check that the adversarial reviewer was REALLY invoked

"APPROVED" in the report is not enough. Check in the log/transcript of the headless session (or
in the full Claude Code transcript, `<session-id>.jsonl` in the local transcript directory of
this project — for sessions before 2026-11-12, the directory of the former `react-object-page`
checkout — if the worktree that produced it has already been removed) that the
`adversarial-reviewer` subagent was really launched through the Agent tool with `model: opus`
when the ticket requires it — a manual review of the diff done by the session itself on sonnet
is not a review round, even if the reported verdict is correct.

If a headless session ended halfway right after starting a subagent in the background without
waiting for it (the parent process exits with `end_turn`, the subagent is killed): resume it
with `--resume <session-id>`, instructing it to invoke the adversarial reviewer on the existing
code/PR, without redoing the development or opening a new PR.

## 6. Verification comment and merge

A comment on the issue (not on the PR) in the standard style: what was verified, the numeric
results (unit/e2e/visual), the low-severity review notes reported in full (not summarised) — if
a note points to a possible real bug (not just style/wording), say so explicitly, do not bury it
among the minor notes. The comment follows the "Language of everything published on GitHub" rule
in `CLAUDE.md`.

```bash
gh pr ready <N>
gh pr merge <N> --merge --delete-branch   # merge commit, never squash
```

Try it directly: it often goes through without the `!` prefix. If the auto-mode classifier
blocks it as "Merge Without Review", ask the maintainer to run the same command with `!` in
front.

## 7. Clean-up

```bash
git worktree remove <verify-dir> --force
```

If the path no longer exists (e.g. the scratch directory is on a tmpfs that is cleared when the
machine restarts): run `git worktree prune -v` from the main checkout to clean up the leftover
administrative references.
