---
id: D-09
type: decision
state: proposed
created: 2026-11-19
---

# D-09: The name is `@osdlc/ref-lease`

## Decision

The package keeps the name `@osdlc/ref-lease` on npm.

Status: proposed. The owner signs this off by changing `state` to `accepted`, or replaces it.

## Recommendation

Accept. The audit asked this as owner question 1, and it settles the name gate (Q1).

## Why

- The name was free on npm and on crates.io when the audit ran.
- It says what the library does: a lease held in a git ref.
- It matches the scope and the naming of the sibling libraries (`@osdlc/typed-git`,
  `@osdlc/trust-repo`).

## What would reopen it

A name clash found after the audit, or a rename of the scope. Both are cheap before many callers
depend on it and costly after.

## Source

The publish-readiness audit, `docs/planning/audits/lib-publish-ready/2026-11-07-ref-lease/report.md`
in sksizer/dev, "Owner questions". Tracked in osdlc/osdlc#685.
