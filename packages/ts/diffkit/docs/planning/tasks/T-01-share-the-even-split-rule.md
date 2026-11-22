---
id: T-01
type: task
state: open
created: 2026-11-22
---

# T-01: One copy of the even-split rule

## Goal

The rule that splits a long list into even slices lives in one place, and both libraries that
use it call it.

## Today

`src/core/split.ts` holds `splitEven`, and `shardFiles` in `@osdlc/rule-review`'s `src/plan.ts`
is the same rule. Neither package exports its copy, and each comment says to change both
together. [D-02](../decisions/D-02-api-and-stability-tiers.md) keeps `splitEven` out of the
public API for that reason.

## Approach

1. Decide where the rule belongs: a small shared package, or an export of one of the two.
2. Move it there with its tests, which pin that 13 files over 4 are 4+3+3+3 and that a limit of 0
   turns splitting off.
3. Replace both copies.

## Acceptance criteria

- [ ] One implementation of the rule, with its tests.
- [ ] `@osdlc/diffkit` and `@osdlc/rule-review` both use it, and neither comment says to change
      two places.
