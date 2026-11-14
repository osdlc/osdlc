---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skill-frontmatter/allowed-tools
  object:
    supported: true
    required: false
    form: comma-separated list or YAML array of tools
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill allowed-tools field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20allowed-tools%20field%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The command reference lists the field in its skill frontmatter table.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill allowed-tools pre-approval docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20allowed-tools%20pre-approval%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills how-to describes the pre-approval.
reportedIn:
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[Copilot docs add skills to Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20add%20skills%20to%20Copilot%20CLI.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[allowed-tools](../../subjects/skill-frontmatter/allowed-tools.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Tools listed in `allowed-tools` are allowed without a prompt while the skill is active.
