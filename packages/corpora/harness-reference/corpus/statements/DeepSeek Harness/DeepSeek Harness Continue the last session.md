---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: cli/continue
  object:
    supported: false
    basis: omitted-from-help
    note: "The headless help has no option that picks the latest session. Each run starts a fresh session unless --session-id <id> names a stored one."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh headless help options](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20headless%20help%20options.md)"
      - "[2026-11-14 dsh headless option source](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20headless%20option%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The headless option list has --session-id <id> and no continue or latest option. Absence in a source listing is moderate."
  - hasEvidenceItems:
      - "[2026-11-14 dsh headless fresh session](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20headless%20fresh%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The headless README says every invocation defaults to a fresh session and --session-id continues one."
reportedIn:
  - "[deepseek-ai deepseek-harness cli-help.md at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20cli-help.md%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness headless startup.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20headless%20startup.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness headless README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20headless%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Continue the last session](../../subjects/cli/Continue%20the%20last%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Absence in the headless option list, plus the README on the default session.
