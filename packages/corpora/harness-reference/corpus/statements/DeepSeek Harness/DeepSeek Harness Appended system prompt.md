---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: cli/append-system-prompt
  object:
    supported: false
    basis: omitted-from-help
    note: The headless help lists no option that adds system or developer text to a run.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh headless help options](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20headless%20help%20options.md)"
      - "[2026-11-14 dsh headless option source](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20headless%20option%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The headless help and the option list in startup.ts have --json, --session-id, --permission-mode, --approval-policy and --add-dir only. Absence in a source listing is moderate."
reportedIn:
  - "[deepseek-ai deepseek-harness cli-help.md at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20cli-help.md%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness headless startup.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20headless%20startup.ts%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Absence in the headless option list only.
