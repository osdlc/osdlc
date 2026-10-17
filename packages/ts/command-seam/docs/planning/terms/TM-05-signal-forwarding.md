---
id: TM-05
type: term
state: accepted
created: 2026-10-16
---

# TM-05: Signal forwarding

## Definition

Passing a termination signal the [host](TM-04-host.md) gets on to the process
groups it started. `installGroupSignalForwarding()` turns it on. While a
[group run](TM-03-group-run.md) is live, `SIGINT`, `SIGTERM` or `SIGHUP` sends
`SIGTERM` to every registered group, then `SIGKILL` after the
[grace period](TM-07-grace-period.md).

## Contrast

Without forwarding, a signal to the host ends the host only. A group run is
in its own group and [session](TM-10-session.md), so it does not get the
signal and is left as an [orphan](TM-09-orphan.md).

## Notes

- Opt-in, experimental and POSIX only
  ([D-07](../decisions/D-07-process-groups.md)).
- The listeners are attached only while a group is starting or live, ahead of
  the host's own listeners.
- When forwarding is the [exit owner](TM-11-exit-owner.md), it ends the host
  with `128 + signal number` and enters the
  [stopping state](TM-06-stopping-state.md).
- `SIGKILL` of the host cannot be caught, so it is never forwarded.
