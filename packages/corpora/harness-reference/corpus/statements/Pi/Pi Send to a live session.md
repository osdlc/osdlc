---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    mechanism: "--mode rpc: prompt, steer and follow_up JSON lines on stdin"
    limit: only a process the caller spawned in RPC mode; no attach to a running TUI
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-09-25 Pi Send to a live session](../../study-results/Pi/2026-09-25%20Pi%20Send%20to%20a%20live%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-09-25.
reportedIn:
  - "[pi harness notes for a dispatcher](../../documents/skillwright/pi%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-09-25T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/send-to-live@pi#scope-[null,null,null]
---

Imported from `facts/pi/cli/send-to-live.md`.
