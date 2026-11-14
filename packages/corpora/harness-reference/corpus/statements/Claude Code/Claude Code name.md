---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: false
    max_length: 256
    default: the directory name
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 docs skills fm all optional](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20all%20optional.md)"
      - "[2026-11-14 docs skills fm name](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The frontmatter reference says every field is optional and that `name` defaults to the directory name.
  - hasEvidenceItems:
      - "[2026-11-14 docs errors name refused](../../study-results/Claude%20Code/2026-11-14%20docs%20errors%20name%20refused.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The error reference says a name may not be over 256 characters.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
  - "[Claude Code docs error reference](../../documents/code.claude.com/Claude%20Code%20docs%20error%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T08:30:37Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The frontmatter reference lists `name` as not required; it sets the command name and defaults to
the directory name. The 256-character limit is from the startup notice quoted in the error
reference, which covers a skill's frontmatter `name` as well as its directory name.
