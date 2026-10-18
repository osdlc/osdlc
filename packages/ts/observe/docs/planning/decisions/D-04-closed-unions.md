---
id: D-04
type: decision
state: accepted
created: 2026-10-18
---

# D-04: The unions are closed

## Decision

`SessionRunState`, `SessionOutcome`, `SessionOrigin`, `LogSource` and
`AgentStatus` are closed unions. A caller may switch over them exhaustively.
This decision covers exactly these five. It does not yet say whether
`SessionCapture`, `SessionKind`, `SessionNameSource` and `SessionDoneOutcome`
are closed.

## Why

- The state machine, the reducer, reconcile and `runStateForStatus` decide by
  these values. A value
  the caller does not handle would be handled wrongly without a compile error
  if the unions were open.
- Exhaustive handling lets the compiler find every place a new value matters.

## Consequences

Adding a value to any of them is a breaking change: a minor version while the
package is 0.x, a major version after.
