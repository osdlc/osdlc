---
id: T-04
type: task
state: open
created: 2026-11-25
---

# T-04: One copy of the even-split rule

## Goal

The rule that splits a long list into even slices lives in one place, and both libraries that
use it call it.

## Today

`src/prep/split.ts` holds `splitEven`, and `shardFiles` in `@osdlc/rule-review`'s `src/plan.ts`
is the same rule. Neither package exports its copy, so
[D-F5NA](../decisions/D-F5NA-fold-review-prep-into-code-stats.md) keeps `splitEven` out of the
public API. The comment on code-stats' copy says to change both together. The comment on
rule-review's copy does not mention code-stats.

## Approach

1. Decide where the rule belongs: a small shared package, or an export of one of the two.
2. Move it there with its tests, which pin that 13 files over 4 are 4+3+3+3 and that a limit of 0
   turns splitting off.
3. Replace both copies.

## Acceptance criteria

- [ ] One implementation of the rule, with its tests.
- [ ] `@osdlc/code-stats` and `@osdlc/rule-review` both use it, and neither comment says to
      change two places.
