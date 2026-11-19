---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/name-source
  object:
    rule: "frontmatter `name`; the directory or file name is not used"
    required_fields:
      - name
      - description
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill parse name and description](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20parse%20name%20and%20description.md)"
      - "[2026-11-14 dsh skill candidate name from frontmatter](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20candidate%20name%20from%20frontmatter.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The parser takes name from the frontmatter and ignores the file without it; the candidate name is the parsed name."
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Skill name source](../../subjects/skills/Skill%20name%20source.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
