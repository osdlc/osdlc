---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: instructions/claude-md
  object:
    supported: true
    role: fallback
    note: project CLAUDE.md is used when no AGENTS.md exists; ~/.claude/CLAUDE.md when no ~/.config/opencode/AGENTS.md exists
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode v1 rules docs CLAUDE.md fallback](../../study-results/OpenCode/2026-11-14%20OpenCode%20v1%20rules%20docs%20CLAUDE.md%20fallback.md)"
      - "[2026-11-14 OpenCode v1 rules docs first matching file wins](../../study-results/OpenCode/2026-11-14%20OpenCode%20v1%20rules%20docs%20first%20matching%20file%20wins.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The V1 rules docs kept in the repository at a6b15d3 describe CLAUDE.md as a fallback when no AGENTS.md exists.
  - hasEvidenceItems:
      - "[2026-08-08 OpenCode Reads CLAUDE.md](../../study-results/OpenCode/2026-08-08%20OpenCode%20Reads%20CLAUDE.md.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
reportedIn:
  - "[OpenCode v1 docs source rules at a6b15d3](../../documents/github.com/OpenCode%20v1%20docs%20source%20rules%20at%20a6b15d3.md)"
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Reads CLAUDE.md](../../subjects/instructions/Reads%20CLAUDE.md.md)"
scope:
  since: null
  until: 2.0.0
  platform: []
  model: null
status: current
supersedes: "[OpenCode Reads CLAUDE.md](OpenCode%20Reads%20CLAUDE.md.md)"
---

The value of the unscoped 2026-08-08 statement, now limited to OpenCode 1 and backed by the V1 rules docs. OpenCode 2 does not read CLAUDE.md; see the 2.x statement.
