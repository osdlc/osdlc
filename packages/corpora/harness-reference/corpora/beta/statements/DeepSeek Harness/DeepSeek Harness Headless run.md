---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: cli/headless
  object:
    command: dsh --profile headless [--json] [--session-id <id>] <task>
    stdin: omit the task or pass -
    one_task_per_run: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-08 DeepSeek Harness Headless run](../../study-results/DeepSeek%20Harness/2026-10-08%20DeepSeek%20Harness%20Headless%20run.md)"
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
subject: "[Headless run](../../subjects/cli/Headless%20run.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/headless@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/cli/headless.md`.
