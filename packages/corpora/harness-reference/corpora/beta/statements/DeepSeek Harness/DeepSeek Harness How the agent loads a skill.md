---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/agent-loading
  object:
    mechanism: skill tool
    loads: "on demand: the model calls skill with the exact name; a /name token in user input injects the body without a tool call"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-08 DeepSeek Harness How the agent loads a skill](../../study-results/DeepSeek%20Harness/2026-10-08%20DeepSeek%20Harness%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-08; its value differs from the latest.
  - hasEvidenceItems:
      - "[2026-11-04 DeepSeek Harness How the agent loads a skill](../../study-results/DeepSeek%20Harness/2026-11-04%20DeepSeek%20Harness%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-04.
reportedIn:
  - "[DeepSeek Harness (dsh) harness notes for a dispatcher](../../documents/skillwright/DeepSeek%20Harness%20%28dsh%29%20harness%20notes%20for%20a%20dispatcher.md)"
  - "[dsh tool-skill package README](../../documents/github.com/dsh%20tool-skill%20package%20README.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: disputed
imported_from: fact:skills/agent-loading@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/skills/agent-loading.md`.

The observations disagree on: mechanism. The latest value is kept.
