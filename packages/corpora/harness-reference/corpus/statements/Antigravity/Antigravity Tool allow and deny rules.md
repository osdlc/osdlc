---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    config_key: permissions.allow, permissions.ask and permissions.deny in ~/.gemini/antigravity-cli/settings.json
    syntax: tool(argument), such as command(git), command(regex:npm run (build|lint|test)), read_file(path), write_file(path), read_url(host), mcp(server/*)
    precedence: Deny > Ask > Allow
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 permissions rules syntax](../../study-results/Antigravity/2026-11-09%20permissions%20rules%20syntax.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 permissions rules precedence](../../study-results/Antigravity/2026-11-09%20permissions%20rules%20precedence.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 permissions rules example](../../study-results/Antigravity/2026-11-09%20permissions%20rules%20example.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[Antigravity docs Permissions and sandbox](../../documents/antigravity.google/Antigravity%20docs%20Permissions%20and%20sandbox.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---


