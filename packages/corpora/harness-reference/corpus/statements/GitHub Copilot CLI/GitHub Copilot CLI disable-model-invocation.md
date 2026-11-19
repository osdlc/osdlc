---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skill-frontmatter/disable-model-invocation
  object:
    supported: true
    effect: the agent does not invoke the skill automatically; default false
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill disable-model-invocation field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20disable-model-invocation%20field%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The command reference lists the field in its skill frontmatter table.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill disable-model-invocation changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20disable-model-invocation%20changelog.md)"
      - "[2026-11-14 GitHub Copilot CLI Skill disable-model-invocation honored changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20disable-model-invocation%20honored%20changelog.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The changelog records the field in 0.0.412 and a fix to honor it fully in 1.0.74.
reportedIn:
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[disable-model-invocation](../../subjects/skill-frontmatter/disable-model-invocation.md)"
scope:
  since: 0.0.412
  until: null
  platform: []
  model: null
status: current
---

The field is documented and has been supported since 0.0.412.
