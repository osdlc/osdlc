---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/user-dirs
  object:
    dirs:
      - ~/.copilot/skills
      - ~/.agents/skills
    order: after the project skill directories, in that order
    note: skills in ~/.claude are not loaded, since 1.0.36
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Personal skill directories docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Personal%20skill%20directories%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Skill locations priority docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20locations%20priority%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills how-to names the directories; the command reference lists locations in priority order.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Home .claude not loaded changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Home%20.claude%20not%20loaded%20changelog.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.0.36 changelog entry.
reportedIn:
  - "[Copilot docs add skills to Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20add%20skills%20to%20Copilot%20CLI.md)"
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[User skill directories](../../subjects/skills/User%20skill%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Personal skills load from two directories in the home directory. `COPILOT_SKILLS_DIRS` and the `skillDirectories` setting add more.
