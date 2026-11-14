---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skills/subagent-visibility
  object:
    supported: "true"
    custom_agents_load_skills_by_default: true
    setting: inheritCustomizations (default true)
    how_to_add: the `skills` frontmatter key lists skill paths
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 changelog agents inherit skills](../../study-results/Antigravity/2026-11-14%20changelog%20agents%20inherit%20skills.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.1.25 changelog says Markdown custom agents inherit ambient skills by default.
  - hasEvidenceItems:
      - "[2026-11-14 build-plugins inheritCustomizations](../../study-results/Antigravity/2026-11-14%20build-plugins%20inheritCustomizations.md)"
      - "[2026-11-14 subagents skills key](../../study-results/Antigravity/2026-11-14%20subagents%20skills%20key.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Build plugins and subagents pages name the frontmatter keys.
reportedIn:
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
  - "[Antigravity docs Build plugins antigravity.google](../../documents/antigravity.google/Antigravity%20docs%20Build%20plugins%20antigravity.google.md)"
  - "[Antigravity docs Subagents](../../documents/antigravity.google/Antigravity%20docs%20Subagents.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Skills in subagents](../../subjects/skills/Skills%20in%20subagents.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Antigravity Skills in subagents open](Antigravity%20Skills%20in%20subagents%20open.md)"
---

Since CLI 1.1.25 a custom agent defined in Markdown inherits the session's skills by default, as the default agents do. `inheritCustomizations: false` turns that off, and `skills` adds named skill folders.
