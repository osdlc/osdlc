---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/bundled-files
  object:
    supported: false
    detail: supporting files do not load into context every run; SKILL.md should reference them so Claude loads them when needed
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Files beside SKILL.md](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Files%20beside%20SKILL.md.md)"
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
subject: "[Files beside SKILL.md](../../subjects/skills/Files%20beside%20SKILL.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which tool does Claude use to load a referenced supporting file, and does the harness list the skill's bundled files when the skill loads?
imported_from: fact:skills/bundled-files@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/bundled-files.md`.

Open questions:
- Which tool does Claude use to load a referenced supporting file, and does the harness list the skill's bundled files when the skill loads?
