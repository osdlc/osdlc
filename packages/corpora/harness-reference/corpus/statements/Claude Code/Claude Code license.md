---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skill-frontmatter/license
  object:
    supported: true
    required: false
    effect: accepted but not acted on
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 docs skills fm license](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20license.md)"
      - "[2026-11-14 docs skills fm all optional](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20all%20optional.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The frontmatter reference lists `license`, says Claude Code accepts it but does not act on it, and says every field is optional.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T08:30:37Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[license](../../subjects/skill-frontmatter/license.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Claude Code accepts `license` so that frontmatter written to the Agent Skills spec loads, and does
nothing with the value. The docs do not say what form the value takes.
