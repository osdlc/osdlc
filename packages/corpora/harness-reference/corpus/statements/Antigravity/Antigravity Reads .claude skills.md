---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skills/claude-dir
  object:
    supported: false
    basis: undocumented
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 discovery two scopes](../../study-results/Antigravity/2026-11-14%20discovery%20two%20scopes.md)"
      - "[2026-11-14 skills cli locations](../../study-results/Antigravity/2026-11-14%20skills%20cli%20locations.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: The lists of skill locations name .agents, ~/.gemini/config and two CLI folders under ~/.gemini. A list can leave a folder out, so this is weak.
reportedIn:
  - "[Antigravity docs Customization discovery](../../documents/antigravity.google/Antigravity%20docs%20Customization%20discovery.md)"
  - "[Antigravity docs Agent skills](../../documents/antigravity.google/Antigravity%20docs%20Agent%20skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Reads .claude skills](../../subjects/skills/Reads%20.claude%20skills.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The skills and Customization discovery pages list every folder skills load from. `.claude/skills` is not among them. Claude Code content comes in through an import instead (`agy plugin import claude`). The value rests on the omission, so it is weak.
