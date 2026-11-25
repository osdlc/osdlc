---
id: D-04
type: decision
state: accepted
created: 2026-11-22
---

# D-04: Operations return a result value

## Decision

`executeOperation`, `executeBatch` and the `SnapshotHistory` methods return an `OperationResult`: an
object with `success: true` and the new canvas, or `success: false` and an `OperationError` with a
code and a message. A request the engine refuses, such as a missing node or a size of zero, does not
throw. A programming error, such as a handler that throws something else, still throws.

## Why

- A refused operation is an expected outcome in an editor: a user drags a node onto nothing, or
  deletes a node twice. A value is easier to handle than an exception, and the type forces the
  caller to look.
- A code is something a program can branch on. The message is for a person.
- A failed operation changes nothing, so the caller needs no cleanup.

## Consequences

- `ErrorCode` is a union that may grow in a minor release. A `switch` over it needs a `default`.
- The result is the package's own small type, not a general `Result` library, so the package has one
  runtime dependency.
