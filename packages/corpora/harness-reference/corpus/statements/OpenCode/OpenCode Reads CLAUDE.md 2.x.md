---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: instructions/claude-md
  object:
    supported: false
    basis: documented
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode instructions docs AGENTS.md only v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20instructions%20docs%20AGENTS.md%20only%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The instructions docs at v2.3.0 say OpenCode V2 recognizes AGENTS.md only and does not use CLAUDE.md as a fallback.
reportedIn:
  - "[OpenCode docs source instructions at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20instructions%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Reads CLAUDE.md](../../subjects/instructions/Reads%20CLAUDE.md.md)"
scope:
  since: 2.0.0
  until: null
  platform: []
  model: null
status: current
supersedes: "[OpenCode Reads CLAUDE.md](OpenCode%20Reads%20CLAUDE.md.md)"
---

The 2026-08-08 statement said CLAUDE.md is read as a fallback, with no version. That is the OpenCode 1 behaviour. The V2 instructions page says V2 reads `AGENTS.md` only. The page speaks of V2 as a whole, so the scope starts at 2.0.0; no 2.0.x source was read.
