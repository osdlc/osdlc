---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/duplicate-names
  object:
    within_one_layer: "lower rank number wins: project .dsh, project .agents, custom dirs, user .dsh, user .agents"
    across_scope_layers: nearest layer wins outright
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 DeepSeek Harness Duplicate skill names](../../study-results/DeepSeek%20Harness/2026-11-04%20DeepSeek%20Harness%20Duplicate%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: source observed 2026-11-04.
reportedIn:
  - "[dsh skill subsystem reference](../../documents/github.com/dsh%20skill%20subsystem%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: strength lowered
    date: 2026-11-14T18:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Duplicate skill names](../../subjects/skills/Duplicate%20skill%20names.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/duplicate-names@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/skills/duplicate-names.md`.

Strength lowered on 2026-11-14: the evidence rated strong is README or guide prose in the repository, which this corpus counts as docs (moderate), not source. The study results keep their `kind`, since study results are not edited.
