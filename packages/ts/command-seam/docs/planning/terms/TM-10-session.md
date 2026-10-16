---
id: TM-10
type: term
state: accepted
created: 2026-10-16
---

# TM-10: Session

## Definition

A set of process groups that share one controlling terminal, or none. A
terminal sends Ctrl-C (`SIGINT`) to the foreground group of its session.

## Contrast

A [process group](TM-01-process-group.md) is the unit a signal is sent to.
A session is the unit a terminal belongs to.

## Notes

- A [group run](TM-03-group-run.md) starts a new session as well as a new
  group (Node's `detached`). It has no controlling terminal, so it does not
  get the terminal's Ctrl-C, and a prompt on `/dev/tty` fails.
- [Signal forwarding](TM-05-signal-forwarding.md) passes the
  [host](TM-04-host.md)'s Ctrl-C on to it.
