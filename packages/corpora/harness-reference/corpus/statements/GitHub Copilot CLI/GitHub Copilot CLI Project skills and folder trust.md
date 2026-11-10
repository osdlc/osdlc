---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/project-trust
  object:
    added_dirs: skills from --add-dir are loaded as trusted configurations; same trust as project skills
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Project skills and folder trust](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Project%20skills%20and%20folder%20trust.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Project skills and folder trust](../../subjects/skills/Project%20skills%20and%20folder%20trust.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Do project skills in .github/skills load only after the user trusts the folder?
imported_from: fact:skills/project-trust@copilot-cli#scope-[null,null,null]
---

Imported from `facts/copilot-cli/skills/project-trust.md`.

Open questions:
- Do project skills in .github/skills load only after the user trusts the folder?
