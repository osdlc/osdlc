---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: config/config-dir-env
  object:
    supported: true
    var: GOOSE_PATH_ROOT
    sets:
      - config
      - data
      - state
      - plugins
      - agents
    still_reads_home:
      - ~/.agents/skills
      - ~/.claude/skills
      - ~/.config/agents/skills
    note: Must be an absolute path. goose uses config, data and state folders under it, and .agents/plugins and .agents/agents under it. The docs file it under development and testing.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose paths GOOSE_PATH_ROOT read](../../study-results/goose/2026-11-14%20goose%20paths%20GOOSE_PATH_ROOT%20read.md)"
      - "[2026-11-14 goose paths under root](../../study-results/goose/2026-11-14%20goose%20paths%20under%20root.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: paths.rs reads the variable and builds every goose directory under it.
  - hasEvidenceItems:
      - "[2026-11-14 goose skills home dirs](../../study-results/goose/2026-11-14%20goose%20skills%20home%20dirs.md)"
      - "[2026-11-14 goose skills home compat dirs](../../study-results/goose/2026-11-14%20goose%20skills%20home%20compat%20dirs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Skill discovery takes the home directory itself, so these folders are still read.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs GOOSE_PATH_ROOT](../../study-results/goose/2026-11-14%20goose%20docs%20GOOSE_PATH_ROOT.md)"
      - "[2026-11-14 goose docs GOOSE_PATH_ROOT subdirectories](../../study-results/goose/2026-11-14%20goose%20docs%20GOOSE_PATH_ROOT%20subdirectories.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The environment variable guide describes the variable and its subdirectories.
reportedIn:
  - "[aaif-goose goose paths.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20paths.rs%20at%202365bc5.md)"
  - "[aaif-goose goose skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skills%20mod.rs%20at%202365bc5.md)"
  - "[aaif-goose goose environment-variables.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20environment-variables.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Config directory variable](../../subjects/config/Config%20directory%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`GOOSE_PATH_ROOT` moves goose config, data and state under one directory. Skill folders in the home directory are still read.
