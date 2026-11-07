---
id: D-06
type: decision
state: accepted
created: 2026-11-07
---

# D-06: Advisory by default; an incomplete run fails only with `--strict`

## Decision

- Findings are reported and exit 0 unless `--blocking` is set. With it, a
  finding at or above the severity floor (`violation` by default) exits 1.
- A judgement that fails (no agent, no key, a timeout, a reply that is not a
  findings object) marks the run incomplete (`degraded`). It never reads as
  clean, and it does not fail the run unless `--strict` is set, which exits 11.
- An unknown engine name is refused before any agent starts.

## Why

- An agent's judgement is not deterministic. A team should see the findings
  before it lets them block a merge.
- An agent that could not be reached is not evidence of a violation, so a
  hook on a laptop with no key should not block a push. In CI the same gap
  would pass every change, so CI turns on `--strict`.

## Consequences

- The CI examples use `--blocking --strict`. The hook examples use
  `--blocking` or nothing.
