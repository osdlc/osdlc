---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skill-frontmatter/extensions
  object:
    fields:
      - when_to_use
      - argument-hint
      - arguments
      - disable-model-invocation
      - user-invocable
      - disallowed-tools
      - model
      - effort
      - context
      - agent
      - background
      - hooks
      - paths
      - shell
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 docs skills fm spec fields](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20spec%20fields.md)"
      - "[2026-11-14 docs skills fm six spec fields](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20six%20spec%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs say Claude Code accepts every field in its frontmatter table and that only six of them are in the Agent Skills spec.
  - hasEvidenceItems:
      - "[2026-11-14 docs skills fm extends standard](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20extends%20standard.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs say Claude Code extends the standard.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T08:30:37Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Harness-only fields](../../subjects/skill-frontmatter/Harness-only%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The list is the Field column of the table under "Frontmatter reference" on the skills page, read on
2026-11-14, less the six fields the same page names as the Agent Skills spec's: `name`,
`description`, `license`, `compatibility`, `metadata` and `allowed-tools`. No single quote holds the
whole list; the study results quote the two sentences the subtraction rests on.
