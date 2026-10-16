---
id: TM-09
type: term
state: accepted
created: 2026-10-16
---

# TM-09: Orphan

## Definition

A process still running after the [host](TM-04-host.md) that started it has
gone. The system gives it a new parent, often pid 1, and nothing is left to
stop it.

## Notes

- [Signal forwarding](TM-05-signal-forwarding.md) exists to prevent orphans
  when the host gets `SIGINT`, `SIGTERM` or `SIGHUP`.
- A `SIGKILL` of the host, or one sent to the host's own process group, still
  leaves a [group run](TM-03-group-run.md)'s tree as orphans
  ([D-07](../decisions/D-07-process-groups.md)).
- A process that ignores `SIGTERM` in a nested host's group can be orphaned;
  see [grace period](TM-07-grace-period.md).
