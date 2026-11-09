---
id: T-06
type: task
state: open
created: 2026-11-07
---

# T-06: Edge cases in the guard

## Goal

Three cases where the guard's answer is defensible but surprising.

## Cases

- **One noisy peer hides the rest.** The denial budget (30 a minute) is shared
  by every peer and drops the rest silently. Count per peer, and report how
  many were dropped when the window rolls over.
- **A link can lower a browser's grant.** Any valid share link replaces the
  cookie, so a page on another site can send a browser with a `full` or
  `admin` cookie to a `read` link. Do not let a cross-site navigation lower
  the grant the cookie holds.
- **Deny rules are case-sensitive.** An app that serves files from a
  case-insensitive file system can be reached around a rule by changing the
  letter case. Add an opt-in for case-insensitive rules
  ([D-05](../decisions/D-05-host-and-origin-checks.md)).

## Done when

- Each case has a test, and the README says what each does.
