---
id: TM-11
type: term
state: accepted
created: 2026-10-16
---

# TM-11: Exit owner

## Definition

The listener that decides when the [host](TM-04-host.md) exits after a
signal. [Signal forwarding](TM-05-signal-forwarding.md) owns the exit when the
host has no listener of its own for that signal. A host listener, including
one added with `process.once`, owns it otherwise.

## Contrast

Owning the exit is separate from killing the groups. Forwarding always kills
the registered groups. Only as exit owner does it also exit the host and
enter the [stopping state](TM-06-stopping-state.md).

## Notes

A host listener that keeps running, such as a REPL cancelling a job, keeps
the host alive and can start new [group runs](TM-03-group-run.md).
