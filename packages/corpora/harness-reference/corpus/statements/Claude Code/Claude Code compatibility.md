---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skill-frontmatter/compatibility
  object:
    supported: true
    required: false
    max_length: 500
    effect: accepted but not acted on
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 docs skills fm compatibility](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20compatibility.md)"
      - "[2026-11-14 docs skills fm all optional](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20all%20optional.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The frontmatter reference lists `compatibility` as a string of up to 500 characters that Claude Code accepts but does not act on, and says every field is optional.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T08:30:37Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[compatibility](../../subjects/skill-frontmatter/compatibility.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Claude Code accepts `compatibility`, a string of up to 500 characters, and does nothing with the
value. The docs do not say what happens to a longer string.
