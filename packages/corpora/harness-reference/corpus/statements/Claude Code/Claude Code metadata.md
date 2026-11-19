---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skill-frontmatter/metadata
  object:
    supported: true
    required: false
    type: free-form map; a value that is not a map is dropped
    effect: accepted but not acted on
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 docs skills fm metadata](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20metadata.md)"
      - "[2026-11-14 docs skills fm all optional](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20all%20optional.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The frontmatter reference lists `metadata` as a free-form YAML map that Claude Code does not act on, and says every field is optional.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T08:30:37Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[metadata](../../subjects/skill-frontmatter/metadata.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`metadata` is a free-form YAML map for the author's own tooling. Claude Code does not act on its
contents and drops a value that is not a map.
