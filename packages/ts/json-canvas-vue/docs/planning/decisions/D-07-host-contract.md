---
id: D-07
type: decision
state: accepted
created: 2026-11-22
---

# D-07: The host contract

## Decision

- **Out.** The board emits `change` with the new immutable canvas once per committed operation,
  undo, redo or history jump. It emits nothing for a failed operation or a view change.
- **In.** A new `canvasContent` value replaces the board and clears its history. A value that is
  identical to the board's own last `change` payload is recognised and ignored, so a host that
  stores each payload and passes it back loses no history and loops nowhere.
- **Read-only.** `readonly` draws the board and refuses every edit: the pointer gestures, the
  keyboard shortcuts bound on `window`, and the exposed `execute`, `executeBatch`, `undo` and
  `redo`. Panning, zooming and fitting stay on.
- **Exposed.** `execute`, `executeBatch`, `undo`, `redo` and `fitToView` are exposed for a host that
  drives the board from outside. Each emits `change` like the built-in controls.
- **Optional arrays.** A canvas that omits `nodes` or `edges` is accepted, as the format allows. The
  board normalises it.

## Why

- A host that owns persistence needs one place to read the result of an edit. The payload is the
  whole document, so the host needs no knowledge of the operations.
- The echo rule lets the common pattern, a store bound to the prop and the event, work without a
  guard in every host.
- A board that only hides its buttons would still delete nodes from the keyboard, so every path that
  edits goes through one seam.

## Consequences

- An external replace during an in-place text edit closes the editor and keeps the host's text.
  Text typed and not yet committed is dropped.
