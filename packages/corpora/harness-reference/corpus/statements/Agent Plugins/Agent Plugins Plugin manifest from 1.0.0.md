---
proposition:
  subject: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
  predicate: plugins/manifest
  object:
    file: plugin.json (at the plugin root)
    skills: optional `skills/<name>/SKILL.md`
    mcp: optional mcp.json
    client_extensions: reverse-domain directories
    covers: skills and MCP only
    schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Agent Plugins Plugin manifest](../../study-results/Agent%20Plugins/2026-10-01%20Agent%20Plugins%20Plugin%20manifest.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-11-09 spec skills location](../../study-results/Agent%20Plugins/2026-11-09%20spec%20skills%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09.
reportedIn:
  - "[Agent Plugins](../../documents/agent-plugins.org/Agent%20Plugins.md)"
  - "[Agent Plugins Specification 1.0.0](../../documents/github.com/Agent%20Plugins%20Specification%201.0.0.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: 1.0.0
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/manifest@agent-plugins#scope-["1.0.0",null,null]
---

Imported from `facts/agent-plugins/plugins/manifest.md`.
