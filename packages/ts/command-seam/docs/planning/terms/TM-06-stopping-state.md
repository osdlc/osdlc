---
id: TM-06
type: term
state: accepted
created: 2026-10-16
---

# TM-06: Stopping state

## Definition

The state a [host](TM-04-host.md) enters at the first forwarded signal when
[signal forwarding](TM-05-signal-forwarding.md) is the
[exit owner](TM-11-exit-owner.md). A new [group run](TM-03-group-run.md) is
refused: it starts nothing and settles with `neverExited: true`,
`reason: 'abort'` and the refusal message in `error`.

## Contrast

A host whose own listener owns the exit gets no stopping state. Its groups are
killed, and later runs start as usual.

## Notes

- `forwardedSignal()` returns the signal, so the host's own loop can stop.
  `forwardedExitCode()` returns `128 + signal number`.
- A plain run is not refused.
- Only the uninstall function returned by `installGroupSignalForwarding()`
  resets it.
