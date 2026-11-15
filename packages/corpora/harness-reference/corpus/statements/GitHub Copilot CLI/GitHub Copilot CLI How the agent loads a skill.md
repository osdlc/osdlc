---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/agent-loading
  object:
    loaded_when_relevant: when relevant to the task, not in every conversation
    body_at_startup: false
    body_on: when invoked via /SKILL-NAME or automatically by the agent; content is injected into the conversation
    decision: Copilot decides from the prompt and the skill description
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI How the agent loads a skill](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI How the agent loads a skill 2](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20How%20the%20agent%20loads%20a%20skill%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI How the agent loads a skill 3](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20How%20the%20agent%20loads%20a%20skill%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Copilot docs about agent skills](../../documents/docs.github.com/Copilot%20docs%20about%20agent%20skills.md)"
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[Copilot docs add skills to Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20add%20skills%20to%20Copilot%20CLI.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does the model load a skill through a named tool or a file read?
imported_from: fact:skills/agent-loading@copilot-cli#scope-[null,null,null]
---

Imported from `facts/copilot-cli/skills/agent-loading.md`.

Open questions:
- Does the model load a skill through a named tool or a file read?
