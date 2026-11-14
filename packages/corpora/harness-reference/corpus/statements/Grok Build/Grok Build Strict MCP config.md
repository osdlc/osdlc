---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: mcp/strict-config
  object:
    supported: false
    basis: omitted-from-help
    note: No option in the CLI argument definitions passes an MCP config file or limits a run to given servers. Managed policy (allowManagedMcpServersOnly) can restrict servers for an organization.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli argument list](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20argument%20list.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The argument definitions were read in full and hold no MCP option. A listing can leave an option out, so this counts one step below source.
  - hasEvidenceItems:
      - "[2026-11-14 grok managed mcp only](../../study-results/Grok%20Build/2026-11-14%20grok%20managed%20mcp%20only.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide describes the managed policy lockdown.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

This is an answer from absence in the argument definitions.
