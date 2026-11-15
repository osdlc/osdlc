---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    command: codex queue --thread <uuid|name> --message <text>
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-09-25 Codex CLI Send to a live session](../../study-results/Codex%20CLI/2026-09-25%20Codex%20CLI%20Send%20to%20a%20live%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-09-25.
reportedIn:
  - "[Codex harness notes for a dispatcher](../../documents/skillwright/Codex%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-09-25T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Whether `codex queue` reaches a session open in a live TUI, or only a saved or idle one.
imported_from: fact:cli/send-to-live@codex#scope-[null,null,null]
---

Imported from `facts/codex/cli/send-to-live.md`.

Open questions:
- Whether `codex queue` reaches a session open in a live TUI, or only a saved or idle one.
