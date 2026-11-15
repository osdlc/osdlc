---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: subagents/definition
  object:
    location: .codex/agents/*.toml
    format: TOML
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Codex CLI Subagent definition](../../study-results/Codex%20CLI/2026-08-08%20Codex%20CLI%20Subagent%20definition.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Subagent definition docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Subagent%20definition%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The subagents docs page says custom agents are standalone TOML files under .codex/agents/ (project) or ~/.codex/agents/ (personal).
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Codex docs subagents](../../documents/learn.chatgpt.com/Codex%20docs%20subagents.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-14T18:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Subagent definition](../../subjects/subagents/Subagent%20definition.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:subagents/definition@codex#scope-[null,null,null]
---

Imported from `facts/codex/subagents/definition.md`.

Checked against the Codex subagents docs on 2026-11-14: the value holds. The page also names `~/.codex/agents/` for personal agents.
