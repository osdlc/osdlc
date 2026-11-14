---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: instructions/rules
  object:
    supported: false
    basis: undocumented
    note: one context file per directory, from a fixed list of names; it applies by directory, not by a rule
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi context file candidates](../../study-results/Pi/2026-11-14%20Pi%20context%20file%20candidates.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The loader takes the first of a fixed list of file names in each directory. A listing with no rules folder, so one step below source.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs context files](../../study-results/Pi/2026-11-14%20Pi%20docs%20context%20files.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: The configuration page describes context files only, attached by directory.
reportedIn:
  - "[Pi source resource-loader.ts at v1.5.2](../../documents/github.com/Pi%20source%20resource-loader.ts%20at%20v1.5.2.md)"
  - "[Pi docs Configuration at v1.5.2](../../documents/github.com/Pi%20docs%20Configuration%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Rules and steering files](../../subjects/instructions/Rules%20and%20steering%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A search of `packages/coding-agent/src` and `docs` at v1.5.2 finds no rules or steering folder and no frontmatter that scopes an instruction file.
