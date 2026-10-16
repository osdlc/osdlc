---
id: TM-08
type: term
state: accepted
created: 2026-10-16
---

# TM-08: Escalation

## Definition

A repeat signal during the [grace period](TM-07-grace-period.md) skips the
rest of it: every registered group gets `SIGKILL` at once. When
[signal forwarding](TM-05-signal-forwarding.md) is the
[exit owner](TM-11-exit-owner.md), any later signal does the same, and the
host exits at once.

## Contrast

The first signal is the graceful step: `SIGTERM`, then a wait. Escalation is
the user saying "stop now", such as a second Ctrl-C.
