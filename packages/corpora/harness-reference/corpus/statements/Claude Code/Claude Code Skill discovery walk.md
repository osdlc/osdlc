---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/discovery-walk
  object:
    parent_dirs: yes, from the start directory up to the repository root
    nested_dirs: not loaded at startup; load the first time Claude reads or edits a file in that subdirectory
    symlinks: supported; target read once even if several links point at it
    add_dir: loads that directory's .claude/skills, .claude/commands and .claude/agents
    plugins_in_skills_dir: parent directories are not searched for plugins
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skill discovery walk](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skill%20discovery%20walk.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skill discovery walk 2](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skill%20discovery%20walk%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skill discovery walk 3](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skill%20discovery%20walk%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skill discovery walk 4](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skill%20discovery%20walk%204.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
  - "[Claude Code docs plugin loading reference](../../documents/code.claude.com/Claude%20Code%20docs%20plugin%20loading%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Skill discovery walk](../../subjects/skills/Skill%20discovery%20walk.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/discovery-walk@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/discovery-walk.md`.
