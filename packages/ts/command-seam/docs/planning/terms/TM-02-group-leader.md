---
id: TM-02
type: term
state: accepted
created: 2026-10-16
---

# TM-02: Group leader

## Definition

The process that started a [process group](TM-01-process-group.md). The
group's id is the leader's pid.

## Contrast

The leader is one member of the group, not the group. The group can outlive
its leader: members it started stay in the group after it exits.

## Notes

- With `processGroup: true`, the runner's direct child is the leader of a new
  group. Signalling `-pid` reaches the whole group; signalling `pid` reaches
  only the leader.
- A group stays registered after its leader exits, until no member is left.
  This holds for the async and managed runners.
  [Signal forwarding](TM-05-signal-forwarding.md) can then still reach a member
  that outlived the leader.
