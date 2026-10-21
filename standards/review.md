# Review

Status: draft.

## Summary

- Every change is reviewed before it merges. How deeply depends on its
  risk, in three tiers: light, standard and deep.
- Review happens in layers: the author checks their own change, the
  mechanical gates run, an independent reviewer reads the diff, and for
  deep changes a person signs off.
- The reviewer is never the author. For an agent-written change, that means
  a different session, and for deep changes a different tool or model as
  well.
- A finding names the place, the failure it causes and the fix. A
  reviewer checks each finding against the code before posting it.
- The author answers every finding: fix it, decline it with a reason, or
  verify it first. Review rounds have a cap.

## Risk tiers

| Tier | A change that | Review |
|---|---|---|
| Light | changes no behaviour: docs, comments, formatting, a dependency patch release, generated output alone | gates pass; one reviewer skims |
| Standard | changes behaviour inside one component, behind an existing interface | gates pass; one independent review against the full rubric |
| Deep | changes a public API or a data format; touches security, authentication, money or personal data; migrates data; changes concurrency or error handling on a critical path; releases or deploys | gates pass; two independent reviews, one by a different tool or model; a named person approves |

When unsure, take the higher tier. The author proposes the tier in the
pull request, and the reviewer may raise it.

## The layers

### 1. Author

Before asking for review, the author:

- runs `check` (see [verbs.md](./verbs.md)) and fixes what fails;
- reads their own diff top to bottom as if someone else wrote it;
- removes debug code, dead code and comments that restate the code;
- updates the documents and tests that the change affects, in the same pull
  request;
- writes the pull request description (below).

### 2. Gates

CI runs `check`, and any slower tiers the project gates on
(`test-integration`, `test-e2e`). A red gate stops the review. Nobody
reviews a change that does not pass its own checks.

Anything a tool can check, a tool checks. A reviewer does not comment on
formatting or a lint rule. If such a comment keeps coming up, the fix is a
new lint rule.

### 3. Independent review

The reviewer reads the whole diff and the code around it, then judges, in
this order:

1. **Correctness.** Bugs, with a concrete failure: which input or state
   gives which wrong result or crash. This is most of the value of review
   and comes first.
2. **Design.** Does the change fit the existing structure and boundaries?
   Does it reuse what exists instead of copying it? Would a reader look for
   it where it was put?
3. **Tests.** Does each behaviour change have a test that would fail
   without it, including the error paths and edge cases the change adds?
4. **Clarity.** Names say what things are. Comments are accurate and
   needed. Nothing is left without a caller.
5. **Docs and compatibility.** Are the documents updated? Does the change
   break a caller, a stored file or a published API without saying so and
   bumping the version?

For a deep change, the reviewer also asks:

- What happens when it fails halfway? Is a retry safe?
- What input could an attacker control, and where is it checked?
- How is it rolled back?
- What does it cost at ten times the current load?

### 4. Sign-off

A deep change needs approval from a named person who owns the area, listed
in `CODEOWNERS` or the project's `owners:`. Agent reviews inform that
person. They do not replace their approval.

## Findings

Each finding states:

- **Where:** file and line.
- **What:** the problem, in one sentence.
- **Why it matters:** the concrete failure, the input that triggers it, or
  the cost of leaving it.
- **Fix:** what to change.
- **Severity:** `blocking` (must be fixed before merge), `should` (fix
  unless there is a reason not to) or `nit` (optional).

Before posting, the reviewer checks each finding against the code: the
failure is reachable, the line is right, and the fix works. A finding that
cannot be checked is labelled as uncertain. A reviewer posts no findings
"for completeness". An empty review is a valid result.

## Responding

The author answers every finding, in one of three ways:

- **Fix** blocking findings, real bugs, and cheap clear improvements.
- **Decline**, with a one-line reason, a matter of taste with no clear
  winner, or a change whose churn outweighs its value.
- **Verify first** when the finding may be wrong: check it against the
  code, then fix or decline.

Edits stay narrow. A review response does not become a refactor.

A re-review covers what changed since the last review, but judges the
change as a whole. After three rounds, unresolved findings go to a person
to decide, rather than another round.

## The pull request

The description answers:

- **What** changed and **why**, in a few sentences.
- **How it was tested**: what was run and what was checked by hand.
- **Risk tier**, with one line on why.
- **For an API change**: a code example of the new use.
- **For a UI change**: before and after screenshots.
- **What is not done** and is left for later.

One pull request holds one change. A pull request that needs "and" in its
title is usually two.

## Merging

A change merges when its gates pass, every finding is answered, and the
approvals its tier needs are in. Squash-merge, so the title becomes the
history and changelog line. Write it for a reader of the changelog.

## Decisions in this draft

Each of these was a choice. Overturn any of them in review.

1. **Three tiers.** Two tiers make everything "normal". More than three
   make people argue about the tier instead of the change.
2. **A different tool or model for deep reviews.** Two sessions of the same
   model tend to miss the same things. A different reviewer finds
   different bugs. `sdlc.yaml` already supports this with `pr_review` and
   its `not_the_author` rule.
3. **Correctness before style.** Following S-0017 in the development
   repository, the rubric is judged on the diff, but bugs come first because
   they are what review most often catches that tests do not.
4. **Three rounds, then a person.** Following S-0018. Past three rounds,
   reviewer and author are usually disagreeing, not converging.
5. **Severity words.** `blocking`, `should`, `nit` are plain and widely
   understood. The development repository's `violation`, `tension` and
   `drift` measure distance from a standard, which is a different
   question. A tool can map between the two.
