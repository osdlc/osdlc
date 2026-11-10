---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: permissions/tool-rules
  object:
    supported: partial
    syntax: Starlark .rules files under a rules folder next to a config layer, such as ~/.codex/rules/default.rules
    note: Rules are execpolicy files; no per-tool allow or deny flag appears in codex exec --help. --ignore-rules skips them.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Tool allow and deny rules docs](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Tool%20allow%20and%20deny%20rules%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Tool allow and deny rules format](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Tool%20allow%20and%20deny%20rules%20format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Tool allow and deny rules flag](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Tool%20allow%20and%20deny%20rules%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-11-09 at 0.162.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
