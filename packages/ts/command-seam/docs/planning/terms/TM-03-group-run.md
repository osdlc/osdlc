---
id: TM-03
type: term
state: accepted
created: 2026-10-16
---

# TM-03: Group run

## Definition

A run started with `processGroup: true`. Its child leads a new
[process group](TM-01-process-group.md) in a new [session](TM-10-session.md),
and the runner registers the group while it is live.

## Contrast

A plain run leaves the child in the [host](TM-04-host.md)'s own group. A
timeout, an abort or `kill()` then reaches only the direct child, and a
terminal's Ctrl-C reaches the child directly. In a group run, all three reach
the whole group, and Ctrl-C reaches it only through
[signal forwarding](TM-05-signal-forwarding.md).

## Notes

- The async capture runner and the managed-process runner take
  `processGroup`. The sync and streaming runners do not in `0.x`
  ([D-07](../decisions/D-07-process-groups.md)).
- `liveProcessGroups()` lists the registered groups.
- In the [stopping state](TM-06-stopping-state.md), a new group run is
  refused.
