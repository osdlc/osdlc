---
id: TM-04
type: term
state: accepted
created: 2026-10-16
---

# TM-04: Host

## Definition

The process that imports `@osdlc/command-seam` and starts runs. Its
children, and the process groups it starts, depend on it to stop them.

## Contrast

The host is the parent side of a run. The child is the process a runner
starts, and its own children are the child's tree.

## Notes

- [Signal forwarding](TM-05-signal-forwarding.md) is installed in the host
  and acts on the signals the host gets.
- A host can be nested: a child of one host can itself import the package and
  start group runs. See [grace period](TM-07-grace-period.md).
