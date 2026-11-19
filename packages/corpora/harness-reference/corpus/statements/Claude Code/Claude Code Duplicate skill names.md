---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/duplicate-names
  object:
    across_plugins: distinct (`a:review`, `b:review`)
    same_plugin_two_marketplaces: identical prefix, no documented tiebreak
    enterprise_personal_project: "one shadows the other: enterprise over personal, personal over project"
    plugin_vs_other_locations: both load; plugin skill is namespaced /plugin-name:skill-name
    user_vs_bundled: user skill replaces the bundled command, not its aliases
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Claude Code Duplicate skill names](../../study-results/Claude%20Code/2026-10-01%20Claude%20Code%20Duplicate%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Duplicate skill names](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Duplicate%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs marketplace reference code.claude.com](../../documents/code.claude.com/Claude%20Code%20docs%20marketplace%20reference%20code.claude.com.md)"
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Duplicate skill names](../../subjects/skills/Duplicate%20skill%20names.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What happens when two skills with the same name exist at the same scope, for example two nested .claude/skills directories in a monorepo?
imported_from: fact:skills/duplicate-names@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/duplicate-names.md`.

Open questions:
- What happens when two skills with the same name exist at the same scope, for example two nested .claude/skills directories in a monorepo?
