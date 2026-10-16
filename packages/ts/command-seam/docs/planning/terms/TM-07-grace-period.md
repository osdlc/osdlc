---
id: TM-07
type: term
state: accepted
created: 2026-10-16
---

# TM-07: Grace period

## Definition

The time a process gets between `SIGTERM` and `SIGKILL`. `SIGTERM` asks it to
stop and lets it clean up; `SIGKILL` ends it without a chance to react.

## Notes

- [Signal forwarding](TM-05-signal-forwarding.md): `graceMs`, default
  1000 ms. Groups still registered when it ends get `SIGKILL`.
  [Escalation](TM-08-escalation.md) cuts it short.
- `stopProcess(handle, { graceMs })`: default 5 s.
- An aborted async run: 1 s.
- A nested [host](TM-04-host.md) needs a `graceMs` shorter than its parent's.
  Otherwise the parent's `SIGKILL` can end it before it sends `SIGKILL` to
  its own groups, and a member that ignores `SIGTERM` is left as an
  [orphan](TM-09-orphan.md) ([D-07](../decisions/D-07-process-groups.md)).
- The 250 ms an async run waits for its pipes to close after the child exits
  is a different wait. It has no `SIGTERM` step.
