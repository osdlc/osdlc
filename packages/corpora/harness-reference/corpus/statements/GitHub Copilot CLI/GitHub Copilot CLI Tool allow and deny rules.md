---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    allow_argv:
      - --allow-tool=TOOL
    deny_argv:
      - --deny-tool=TOOL
    syntax: Kind(argument)
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 GitHub Copilot CLI Allow tool option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Allow%20tool%20option%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI Tool permission pattern docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Tool%20permission%20pattern%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: command reference.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
