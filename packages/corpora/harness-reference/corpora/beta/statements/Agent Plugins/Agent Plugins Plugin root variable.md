---
proposition:
  subject: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
  predicate: skills/plugin-root-variable
  object:
    variables:
      - PLUGIN_ROOT
      - PLUGIN_DATA
    plugin_root: absolute path of the filesystem-resolved plugin root
    substituted_in: MCP stdio args, env values and cwd
    not_in: env keys, command, fixed component locations, http url
    requirement: clients MUST expand in supported configuration fields
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Agent Plugins Plugin root variable](../../study-results/Agent%20Plugins/2026-11-04%20Agent%20Plugins%20Plugin%20root%20variable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Agent Plugins Plugin root variable 2](../../study-results/Agent%20Plugins/2026-11-04%20Agent%20Plugins%20Plugin%20root%20variable%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Agent Plugins Specification](../../documents/agent-plugins.org/Agent%20Plugins%20Specification.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
subject: "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does the spec say whether ${PLUGIN_ROOT} is substituted in SKILL.md bodies or hook files? The fetched text is silent on skills and hooks.
imported_from: fact:skills/plugin-root-variable@agent-plugins#scope-[null,null,null]
---

Imported from `facts/agent-plugins/skills/plugin-root-variable.md`.

Open questions:
- Does the spec say whether ${PLUGIN_ROOT} is substituted in SKILL.md bodies or hook files? The fetched text is silent on skills and hooks.
