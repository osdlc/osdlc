---
id: D-08
type: decision
state: accepted
created: 2026-10-18
---

# D-08: Platforms

## Decision

- Linux and macOS are supported. The process scan reads `/proc` on Linux and
  runs `ps -E` on macOS.
- On Windows, the record, the log and the machine id work. The process scan
  returns `null`, which means it cannot tell.
- Node.js 22 or later. CI runs on Linux and macOS, on Node 22 and 24.

## Why

- The scan reads other processes' environments, and the package has no
  reader for that on Windows.
- `null` is different from an empty list. An empty list means no process is
  running. `null` means unknown, so reconcile never ends a record on Windows.

## Consequences

- On Windows, a record whose process died stays open until something else
  ends it.
- Support for Windows needs a scan that reads process environments there.
