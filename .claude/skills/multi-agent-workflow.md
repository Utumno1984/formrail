---
name: multi-agent-workflow
description: Standard for the pre-merge review and the QA validation of a ticket before marking it ready — use it as a quick reference for the developer/tester/adversarial-reviewer pipeline described in full in CLAUDE.md and in the agents in .claude/agents/.
---

# Multi-agent workflow

A quick reference to the complete pipeline (the source of truth remains `CLAUDE.md` and the
individual agents in `.claude/agents/`: this skill distils only the rules that are easy to forget
or get around under pressure).

## Order, without skipping steps

`planner` → `developer` (branch + draft PR) → green CI → `tester` (QA) →
`adversarial-reviewer` (red team) → `gh pr ready`. If the tester or the adversarial reviewer
reject, the PR goes back to the developer and the pipeline restarts from the CI check. **After 2
rejections by the adversarial-reviewer, or after 2 rejections by the tester, on the same ticket,
stop and ask the maintainer**; work resumes only on the maintainer's instruction (maintainer
decision, 2026-11-12). The two counts are separate, and rejections are counted, not returns to
the developer. Red CI does not count. The count is per ticket, not per PR. A rejection also
counts when it comes from a round restricted to the points of the previous round, and also when
the problem found is new (not one of the points already approved). The details are in
`CLAUDE.md`, step 2.5.

## The adversarial reviewer must REALLY be invoked

The easiest way to cheat, even unintentionally: declaring "adversarial reviewer: APPROVED" after
a manual review of the diff done by the session itself, without ever launching the
`adversarial-reviewer` subagent through the Agent tool. It has already happened in this project
(ticket #10): the final report said "approved" but the subagent had never started, and the real
round (actually launched, on `opus`) found a real blocker that the manual review had missed.

**Before accepting an "APPROVED"**, check that the report explicitly states that the subagent
was invoked through the Agent tool (not "I reviewed the diff myself"). A missed round is worse
than no round: it gives false confidence.

## Model of the adversarial reviewer

`opus` by default. `sonnet` only on an explicitly low-risk ticket (a story, a text, a visual
polish with no state/accessibility involved) — whoever invokes the adversarial reviewer decides
it and records it in the launch prompt ("adversarial reviewer: sonnet (low risk)", with the
reason), not on the ticket: model names are not published on GitHub (`CLAUDE.md`, "Language of
everything published on GitHub"). When in doubt, it stays `opus`.

## QA before closing

The tester verifies **every acceptance criterion** with an explicitly named test that covers it
(not "I checked it by eye"); if Playwright does not start because of environment/permission
limits, the tester says so explicitly instead of faking a local outcome — for the e2e part CI is
authoritative. A PR must not be marked ready with incomplete QA kept quiet.
