---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/discovery-walk
  object:
    locations:
      - .github/skills
      - .agents/skills
      - .claude/skills
      - parent .github/skills (monorepo)
      - ~/.copilot/skills
      - ~/.agents/skills
    extra_dirs: COPILOT_SKILLS_DIRS, comma-separated
    exclusion: ignoredSkillsLocations setting excludes directories and their descendants
    layout: each skill in a subdirectory containing SKILL.md
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Skill discovery walk](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Skill%20discovery%20walk.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Skill discovery walk 2](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Skill%20discovery%20walk%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Skill discovery walk 3](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Skill%20discovery%20walk%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[Copilot docs CLI config directory reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20config%20directory%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Skill discovery walk](../../subjects/skills/Skill%20discovery%20walk.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Are symlinked skill folders followed?
  - Do parent-directory walks include .agents/skills and .claude/skills, or only .github/skills?
imported_from: fact:skills/discovery-walk@copilot-cli#scope-[null,null,null]
---

Imported from `facts/copilot-cli/skills/discovery-walk.md`.

Open questions:
- Are symlinked skill folders followed?
- Do parent-directory walks include .agents/skills and .claude/skills, or only .github/skills?
