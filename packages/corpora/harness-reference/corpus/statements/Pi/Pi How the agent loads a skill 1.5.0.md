---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/agent-loading
  object:
    mechanism: the model reads SKILL.md with the read tool
    base_dir: the model is told to resolve relative paths against the skill directory
    trigger: task matches the description
    explicit: /skill:name
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi skills loading](../../study-results/Pi/2026-11-09%20Pi%20skills%20loading.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Skills page.
  - hasEvidenceItems:
      - "[2026-11-09 Pi skill prompt text](../../study-results/Pi/2026-11-09%20Pi%20skill%20prompt%20text.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The skills prompt tells the model to use the read tool.
  - hasEvidenceItems:
      - "[2026-11-09 Pi skill relative paths](../../study-results/Pi/2026-11-09%20Pi%20skill%20relative%20paths.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Relative-path instruction.
  - hasEvidenceItems:
      - "[2026-11-09 Pi skills force load](../../study-results/Pi/2026-11-09%20Pi%20skills%20force%20load.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: /skill:name forces a load.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Pi How the agent loads a skill](Pi%20How%20the%20agent%20loads%20a%20skill.md)"
---

The earlier dispute was wording: source and docs say the same thing. The earlier statement is kept, superseded.
