---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/project-trust
  object:
    skill_folder_as_plugin_in_project: requires accepting the workspace trust dialog
    project_plugins: load only after the trust check; trusting a parent folder or -p is not enough
    allowed_tools_gate: workspace trust does not gate a project skill's allowed-tools field
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Project skills and folder trust](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Project%20skills%20and%20folder%20trust.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Project skills and folder trust 2](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Project%20skills%20and%20folder%20trust%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Project skills and folder trust 3](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Project%20skills%20and%20folder%20trust%203.md)"
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
subject: "[Project skills and folder trust](../../subjects/skills/Project%20skills%20and%20folder%20trust.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does a plain project skill (not a plugin folder) appear in the skill listing in a folder the user has not trusted?
imported_from: fact:skills/project-trust@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/project-trust.md`.

Open questions:
- Does a plain project skill (not a plugin folder) appear in the skill listing in a folder the user has not trusted?
