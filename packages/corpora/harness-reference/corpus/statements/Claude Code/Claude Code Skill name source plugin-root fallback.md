---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/name-source
  object:
    rule: frontmatter `name` if set, else the directory name
    root_skill_needs_name: false
    root_skill_fallback: a plugin-root SKILL.md with no `name` takes the plugin's directory name
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 skills docs plugin-root name fallback](../../study-results/Claude%20Code/2026-11-14%20skills%20docs%20plugin-root%20name%20fallback.md)"
      - "[2026-11-14 skills docs plugin-root row](../../study-results/Claude%20Code/2026-11-14%20skills%20docs%20plugin-root%20row.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page says a plugin-root SKILL.md without `name` falls back to the plugin directory name.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Skill name source](../../subjects/skills/Skill%20name%20source.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Claude Code Skill name source](Claude%20Code%20Skill%20name%20source.md)"
open:
  - From which version does a plugin-root SKILL.md without `name` fall back to the plugin directory name? The skills page gives none.
---

The 2026-10-01 statement recorded that a skill at the plugin root needs a `name`. The skills page now says `name` supplies the final segment and, without it, Claude Code falls back to the plugin's directory name. The page gives no version for the change, so the scope is not limited.
