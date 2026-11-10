---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/discovery-walk
  object:
    parent_dirs: yes, from current working directory up to the repository root
    locations:
      - $CWD/.agents/skills
      - $CWD/../.agents/skills
      - $REPO_ROOT/.agents/skills
      - ~/.agents/skills
      - /etc/codex/skills
      - bundled system skills
    symlinks: supported; target followed when scanning
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI Skill discovery walk](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20Skill%20discovery%20walk.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI Skill discovery walk 2](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20Skill%20discovery%20walk%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Codex docs build skills (redirect target of developers.openai.com codex skills)](../../documents/learn.chatgpt.com/Codex%20docs%20build%20skills%20%28redirect%20target%20of%20developers.openai.com%20codex%20skills%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Skill discovery walk](../../subjects/skills/Skill%20discovery%20walk.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does Codex scan nested .agents/skills directories below the working directory in a monorepo?
imported_from: fact:skills/discovery-walk@codex#scope-[null,null,null]
---

Imported from `facts/codex/skills/discovery-walk.md`.

Open questions:
- Does Codex scan nested .agents/skills directories below the working directory in a monorepo?
