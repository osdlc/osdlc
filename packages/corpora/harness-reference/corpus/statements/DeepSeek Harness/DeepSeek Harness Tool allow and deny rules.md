---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: permissions/tool-rules
  object:
    supported: false
    basis: omitted-from-help
    note: "The headless help has no option that names tools; --permission-mode and --approval-policy select a preset and an approval policy. A plugin can mask tools with ctx.tools.restrict()."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh headless help options](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20headless%20help%20options.md)"
      - "[2026-11-14 dsh headless option source](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20headless%20option%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The full headless option list has no tool allow or deny option. Absence in a source listing is moderate."
  - hasEvidenceItems:
      - "[2026-11-14 dsh tools restrict mask](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20tools%20restrict%20mask.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The tools README describes the allow or deny mask as a plugin API."
reportedIn:
  - "[deepseek-ai deepseek-harness cli-help.md at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20cli-help.md%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness headless startup.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20headless%20startup.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness tools README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20tools%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
