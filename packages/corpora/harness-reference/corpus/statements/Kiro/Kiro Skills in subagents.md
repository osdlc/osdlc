---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: skills/subagent-visibility
  object:
    custom_agents_inherit_default_resources: true
    setting: chat.disableInheritingDefaultResources (default false)
    startup: metadata only, full content on demand
    custom_agents_load_skills_by_default: false
    how_to_add: skill:// URIs in the agent resources field
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Kiro Skills in subagents](../../study-results/Kiro/2026-11-04%20Kiro%20Skills%20in%20subagents.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Kiro Skills in subagents 2](../../study-results/Kiro/2026-11-04%20Kiro%20Skills%20in%20subagents%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Kiro docs Custom agents configuration reference](../../documents/kiro.dev/Kiro%20docs%20Custom%20agents%20configuration%20reference.md)"
  - "[Kiro docs Agent Skills](../../documents/kiro.dev/Kiro%20docs%20Agent%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Skills in subagents](../../subjects/skills/Skills%20in%20subagents.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Can a subagent see and load the parent session skills? The subagents page names only steering, MCP and permissions as shared.
imported_from: fact:skills/subagent-visibility@kiro#scope-[null,null,null]
---

Imported from `facts/kiro/skills/subagent-visibility.md`.

Open questions:
- Can a subagent see and load the parent session skills? The subagents page names only steering, MCP and permissions as shared.
