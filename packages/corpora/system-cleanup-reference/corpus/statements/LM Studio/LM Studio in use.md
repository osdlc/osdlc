---
proposition:
  subject: '[LM Studio](../../stores/LM%20Studio.md)'
  predicate: liveness/in-use
  object:
    processes:
    - llmster
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 LM Studio in use 1](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20in%20use%201.md)'
  - '[2026-11-21 LM Studio in use 2](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20in%20use%202.md)'
  - '[2026-11-21 LM Studio in use 3](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20in%20use%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: LM Studio runs either as the desktop app or as the llmster daemon; `lms daemon status`
    reports whether llmster runs and `lms ps` shows loaded models.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[LM Studio](../../stores/LM%20Studio.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The desktop app's process name and any lock files are not documented.
---

LM Studio runs either as the desktop app or as the llmster daemon; `lms daemon status` reports whether llmster runs and `lms ps` shows loaded models.
