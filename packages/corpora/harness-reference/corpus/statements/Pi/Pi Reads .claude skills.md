---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/claude-dir
  object:
    supported: false
    basis: undocumented
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill default directories](../../study-results/Pi/2026-11-14%20Pi%20skill%20default%20directories.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The default skill directories are the agent directory and the project config directory. A listing with no .claude entry, so one step below source.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs agent skills locations](../../study-results/Pi/2026-11-14%20Pi%20docs%20agent%20skills%20locations.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: The skills page names .agents/skills as the other location and no .claude one.
reportedIn:
  - "[Pi source skills.ts at v1.5.2](../../documents/github.com/Pi%20source%20skills.ts%20at%20v1.5.2.md)"
  - "[Pi docs Skills at v1.5.2](../../documents/github.com/Pi%20docs%20Skills%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Reads .claude skills](../../subjects/skills/Reads%20.claude%20skills.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A search of `packages/coding-agent/src` at v1.5.2 finds no `.claude` path. A user can still add any directory through the `skills` setting or `--skill`.
