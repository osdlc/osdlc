---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: instructions/agents-md
  object:
    supported: true
    role: "fallback: read only when there is no CLAUDE.md in the working directory or above it"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 changelog agents-md](../../study-results/Claude%20Code/2026-11-09%20changelog%20agents-md.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 2.1.277 changelog adds AGENTS.md support.
  - hasEvidenceItems:
      - "[2026-11-09 docs memory agents-md rule](../../study-results/Claude%20Code/2026-11-09%20docs%20memory%20agents-md%20rule.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: By default AGENTS.md is read only when there is no CLAUDE.md.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Reads AGENTS.md](../../subjects/instructions/Reads%20AGENTS.md.md)"
scope:
  since: 2.1.277
  until: null
  platform: []
  model: null
status: current
supersedes: "[Claude Code Reads AGENTS.md](Claude%20Code%20Reads%20AGENTS.md.md)"
---
