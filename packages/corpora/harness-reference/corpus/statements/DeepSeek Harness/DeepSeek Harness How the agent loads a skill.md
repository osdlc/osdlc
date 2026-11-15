---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/agent-loading
  object:
    mechanism: skill tool
    loads: "on demand: the model calls skill with the exact skill name"
    user_activation: a /name token in direct user input that names a user-invocable skill injects the body
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 DeepSeek Harness How the agent loads a skill](../../study-results/DeepSeek%20Harness/2026-11-04%20DeepSeek%20Harness%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: source observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-09 tool-skill user invocation](../../study-results/DeepSeek%20Harness/2026-11-09%20tool-skill%20user%20invocation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: source observed 2026-11-09.
reportedIn:
  - "[dsh tool-skill package README](../../documents/github.com/dsh%20tool-skill%20package%20README.md)"
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
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: strength lowered
    date: 2026-11-14T18:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/agent-loading@dsh#scope-[null,null,null]
---

Strength lowered on 2026-11-14: the evidence rated strong is README or guide prose in the repository, which this corpus counts as docs (moderate), not source. The study results keep their `kind`, since study results are not edited.
