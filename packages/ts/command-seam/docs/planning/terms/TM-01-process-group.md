---
id: TM-01
type: term
state: accepted
created: 2026-10-16
---

# TM-01: Process group

## Definition

A set of processes that the operating system signals together. A signal sent
to the group reaches every member at once, including processes that members
started and that were not moved to another group.

## Contrast

Signalling a process reaches that one process. Its children keep running
unless it stops them itself. Signalling its group reaches the children too.

## Notes

- A process starts in its parent's group. The
  [group leader](TM-02-group-leader.md) is the process whose pid is the
  group's id.
- A [group run](TM-03-group-run.md) starts its child in a new group, so a
  timeout, an abort or `kill()` reaches the whole tree. See
  [D-07](../decisions/D-07-process-groups.md).
- POSIX only. Windows has no process groups in this sense
  ([T-01](../tasks/T-01-windows-support.md)).
