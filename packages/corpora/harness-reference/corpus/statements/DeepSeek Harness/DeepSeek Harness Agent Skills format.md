---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/agent-skills-format
  object:
    supported: true
    layout: "<name>/SKILL.md one level under a skills root; a flat <name>.md file is also read"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill root entry layout](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20root%20entry%20layout.md)"
      - "[2026-11-14 dsh skill parse name and description](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20parse%20name%20and%20description.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The local provider reads SKILL.md in each directory under a root and requires name and description frontmatter."
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill identity doc](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20identity%20doc.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The skills doc names the two accepted layouts."
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness skills subsystem doc at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skills%20subsystem%20doc%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Agent Skills format](../../subjects/skills/Agent%20Skills%20format.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The sources read do not name agentskills.io; the value records the folder layout the provider reads.
