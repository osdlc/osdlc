---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/plugin-namespace
  object:
    runtime_name: acme-tools:review
    namespace_from: plugin manifest `name`
    bare_alias: "`/fancy` also invokes a plugin skill whose frontmatter `name` is `fancy`, unless another command already uses that name"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Claude Code Plugin skill runtime name](../../study-results/Claude%20Code/2026-10-01%20Claude%20Code%20Plugin%20skill%20runtime%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-10-29 Claude Code Plugin skill runtime name](../../study-results/Claude%20Code/2026-10-29%20Claude%20Code%20Plugin%20skill%20runtime%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-29.
reportedIn:
  - "[Claude Code docs plugins reference](../../documents/code.claude.com/Claude%20Code%20docs%20plugins%20reference.md)"
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-29T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Plugin skill runtime name](../../subjects/skills/Plugin%20skill%20runtime%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Whether a bare name also works for a plugin skill whose name comes from its directory. The docs state it only for a skill whose frontmatter `name` is set.
  - Whether the model's `Skill` tool resolves a bare plugin skill name, and in which versions.
imported_from: fact:skills/plugin-namespace@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/plugin-namespace.md`.

Open questions:
- Whether a bare name also works for a plugin skill whose name comes from its directory. The docs state it only for a skill whose frontmatter `name` is set.
- Whether the model's `Skill` tool resolves a bare plugin skill name, and in which versions.
