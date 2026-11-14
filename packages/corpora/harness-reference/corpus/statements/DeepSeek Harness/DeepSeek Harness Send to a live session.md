---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    headless: no; one task per run
    acp: "dsh --profile acp: session/prompt on a held-open process, one prompt at a time"
    sdk: JSON-RPC with initialize, session/prompt, shutdown
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-08 DeepSeek Harness Send to a live session](../../study-results/DeepSeek%20Harness/2026-10-08%20DeepSeek%20Harness%20Send%20to%20a%20live%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-08.
reportedIn:
  - "[DeepSeek Harness (dsh) harness notes for a dispatcher](../../documents/skillwright/DeepSeek%20Harness%20%28dsh%29%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-08T00:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/send-to-live@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/cli/send-to-live.md`.
