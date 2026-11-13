---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/live-reload
  object:
    supported: partial
    detail: a skill added mid-session needs /skills reload
    command: /skills reload reloads skills from all directories
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Skill edits mid-session](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Skill%20edits%20mid-session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Skill edits mid-session 2](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Skill%20edits%20mid-session%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Copilot docs add skills to Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20add%20skills%20to%20Copilot%20CLI.md)"
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Skill edits mid-session](../../subjects/skills/Skill%20edits%20mid-session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Are edits to an existing skill picked up without /skills reload?
imported_from: fact:skills/live-reload@copilot-cli#scope-[null,null,null]
---

Imported from `facts/copilot-cli/skills/live-reload.md`.

Open questions:
- Are edits to an existing skill picked up without /skills reload?
