---
kind: docs
reportedIn:
  - "[pi harness notes for a dispatcher](../../documents/skillwright/pi%20harness%20notes%20for%20a%20dispatcher.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 0.84.3
version_basis: exact
observed: 2026-09-25
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-09-25T00:00:00Z
imported_from: fact:cli/send-to-live@pi#observation-1
---

Imported from `facts/pi/cli/send-to-live.md`, observation 1.

- supported: "partial"
- mechanism: "--mode rpc: prompt, steer and follow_up JSON lines on stdin"
- limit: "only a process the caller spawned in RPC mode; no attach to a running TUI"
