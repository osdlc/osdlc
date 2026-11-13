---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skills/agent-loading
  object:
    mechanism: model invokes the skill on its own, or the user runs /name
    loads: on invocation, instructions loaded into the conversation
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Grok Build How the agent loads a skill](../../study-results/Grok%20Build/2026-11-04%20Grok%20Build%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-04.
reportedIn:
  - "[Grok Build user guide Skills](../../documents/github.com/Grok%20Build%20user%20guide%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which tool does the model call to invoke a skill?
imported_from: fact:skills/agent-loading@grok-build#scope-[null,null,null]
---

Imported from `facts/grok-build/skills/agent-loading.md`.

Open questions:
- Which tool does the model call to invoke a skill?
