---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: subagents/definition
  object:
    file_format: none; community extensions only
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Pi Subagent definition](../../study-results/Pi/2026-08-08%20Pi%20Subagent%20definition.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-14 Pi readme no sub-agents](../../study-results/Pi/2026-11-14%20Pi%20readme%20no%20sub-agents.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The README at v1.5.2 says Pi skips features like sub-agents and points to packages instead.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Pi coding-agent README at v1.5.2](../../documents/github.com/Pi%20coding-agent%20README%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-14T18:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Subagent definition](../../subjects/subagents/Subagent%20definition.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:subagents/definition@pi#scope-[null,null,null]
---

Imported from `facts/pi/subagents/definition.md`.

Checked against the Pi README at v1.5.2 on 2026-11-14: Pi ships no sub-agent feature, so it has no definition format of its own.
