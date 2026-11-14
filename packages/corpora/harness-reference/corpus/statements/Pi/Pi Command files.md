---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: commands/files
  object:
    supported: true
    note: "prompt templates: a Markdown file in ~/.pi/agent/prompts or .pi/prompts becomes a /command named after the file"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs prompt templates](../../study-results/Pi/2026-11-14%20Pi%20docs%20prompt%20templates.md)"
      - "[2026-11-14 Pi docs prompt template name](../../study-results/Pi/2026-11-14%20Pi%20docs%20prompt%20template%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Prompt templates page.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs user prompt directory](../../study-results/Pi/2026-11-14%20Pi%20docs%20user%20prompt%20directory.md)"
      - "[2026-11-14 Pi docs prompt directories](../../study-results/Pi/2026-11-14%20Pi%20docs%20prompt%20directories.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The user and project prompt directories.
reportedIn:
  - "[Pi docs Prompt Templates at v1.5.2](../../documents/github.com/Pi%20docs%20Prompt%20Templates%20at%20v1.5.2.md)"
  - "[Pi docs Configuration at v1.5.2](../../documents/github.com/Pi%20docs%20Configuration%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Command files](../../subjects/commands/Command%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Pi calls command files prompt templates. Skills are a separate resource, called as `/skill:name`.
