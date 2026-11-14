---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: true
    max_length: 64
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill name field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20name%20field%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Skill name required docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20name%20required%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The command reference and the skills how-to mark the field required; the reference gives the limit.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill name and description optional changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20name%20and%20description%20optional%20changelog.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: weak
    description: The 0.0.410 changelog entry says name and description became optional, with fallbacks. The current docs still mark both required.
reportedIn:
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[Copilot docs add skills to Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20add%20skills%20to%20Copilot%20CLI.md)"
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does a skill with no name load, and what name does it get?
---

The docs mark `name` required, with a limit of 64 characters. The changelog for 0.0.410 says the runtime made it optional with a fallback, so the strength is lowered.
