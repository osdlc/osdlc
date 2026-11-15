---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/relative-paths
  object:
    variable: ${CLAUDE_SKILL_DIR}
    resolves_to: directory containing the skill's SKILL.md; for plugin skills the skill's subdirectory, not the plugin root
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Relative paths in SKILL.md](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Relative%20paths%20in%20SKILL.md.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Relative paths in SKILL.md](../../subjects/skills/Relative%20paths%20in%20SKILL.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What folder does a bare relative path in a SKILL.md body (for example scripts/x.py) resolve from, and does Claude Code tell the model the skill's base directory when the skill loads?
imported_from: fact:skills/relative-paths@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/relative-paths.md`.

Open questions:
- What folder does a bare relative path in a SKILL.md body (for example scripts/x.py) resolve from, and does Claude Code tell the model the skill's base directory when the skill loads?
