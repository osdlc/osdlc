---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: skills/agent-loading
  object:
    mechanism: selected by description, or explicitly
    progressive: true
    manual_invocation: type / in Agent chat; attaches the skill to one message
    resources_on_demand: true
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Cursor How the agent loads a skill](../../study-results/Cursor/2026-10-01%20Cursor%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-11-04 Cursor How the agent loads a skill](../../study-results/Cursor/2026-11-04%20Cursor%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Cursor How the agent loads a skill 2](../../study-results/Cursor/2026-11-04%20Cursor%20How%20the%20agent%20loads%20a%20skill%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Cursor docs Agent Skills](../../documents/cursor.com/Cursor%20docs%20Agent%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Whether the CLI (cursor-agent) loads skills and plugins the way the IDE does.
  - What mechanism loads the SKILL.md body when the agent picks a skill (a tool call or a file read)?
imported_from: fact:skills/agent-loading@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/skills/agent-loading.md`.

Open questions:
- Whether the CLI (cursor-agent) loads skills and plugins the way the IDE does.
- What mechanism loads the SKILL.md body when the agent picks a skill (a tool call or a file read)?

Rechecked 2026-11-09 against the installed CLI and vendor docs. Whether the CLI loads skills the way the IDE does stays open.
