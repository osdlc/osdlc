---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/plugin-root-variable
  object:
    variables: []
    skills_substitution_note: none; the SKILL.md body is passed unchanged, and the model is given the skill directory to resolve relative paths against
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill command block](../../study-results/Pi/2026-11-14%20Pi%20skill%20command%20block.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The body is inserted with no substitution, after a line that names the skill directory. Absence of a substitution step, so one step below source.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs skill bundled files](../../study-results/Pi/2026-11-14%20Pi%20docs%20skill%20bundled%20files.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "Skills page: relative paths, and Pi tells the model where the skill lives."
reportedIn:
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
  - "[Pi docs Skills at v1.5.2](../../documents/github.com/Pi%20docs%20Skills%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A search of `packages/coding-agent/src` at v1.5.2 finds no `PLUGIN_ROOT` or similar variable. This covers skills only; variables in extension or MCP config were not checked.
