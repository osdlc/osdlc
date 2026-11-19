---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/name-source
  object:
    rule: frontmatter `name`
    note: typically the same as the skill directory name; a command file takes its name from the filename
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill name defined in SKILL.md docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20name%20defined%20in%20SKILL.md%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Skills deduplicated by name field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skills%20deduplicated%20by%20name%20field%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Command files docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Command%20files%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs say the name is defined in SKILL.md.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill name and description optional changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20name%20and%20description%20optional%20changelog.md)"
    directionOfEvidenceProvided: neutral
    description: The 0.0.410 changelog entry says a missing name gets a fallback, and does not say what it is.
reportedIn:
  - "[Copilot docs add skills to Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20add%20skills%20to%20Copilot%20CLI.md)"
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Skill name source](../../subjects/skills/Skill%20name%20source.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What name does a skill get when its frontmatter has no name?
---

The skill name is the frontmatter `name`. The changelog says a fallback applies when it is missing; no source read says what the fallback is.
