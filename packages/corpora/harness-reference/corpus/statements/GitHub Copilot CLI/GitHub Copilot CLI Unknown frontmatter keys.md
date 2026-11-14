---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skill-frontmatter/unknown-keys
  object:
    behavior: the skill loads; warnings about unknown fields are suppressed
    documented_keys:
      - name
      - description
      - license
      - argument-hint
      - allowed-tools
      - user-invocable
      - disable-model-invocation
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Unknown frontmatter fields load changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Unknown%20frontmatter%20fields%20load%20changelog.md)"
      - "[2026-11-14 GitHub Copilot CLI Unknown frontmatter field warnings changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Unknown%20frontmatter%20field%20warnings%20changelog.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The changelog says such skills load (0.0.403) and that the warnings were then suppressed (1.0.3).
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill name field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20name%20field%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Skill description field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20description%20field%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Skill argument-hint field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20argument-hint%20field%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Skill allowed-tools field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20allowed-tools%20field%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Skill user-invocable field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20user-invocable%20field%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Skill disable-model-invocation field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20disable-model-invocation%20field%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Skill license field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20license%20field%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs name these keys.
reportedIn:
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[Copilot docs add skills to Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20add%20skills%20to%20Copilot%20CLI.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Unknown frontmatter keys](../../subjects/skill-frontmatter/Unknown%20frontmatter%20keys.md)"
scope:
  since: 1.0.3
  until: null
  platform: []
  model: null
status: current
---

From 0.0.403 a skill with an unknown frontmatter field loads with a warning. From 1.0.3 the warning is suppressed.
