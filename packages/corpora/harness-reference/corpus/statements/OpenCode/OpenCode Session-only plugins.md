---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/session-load
  object:
    supported: false
    basis: omitted-from-help
    disable_via: a -<id> entry in the plugins array of opencode.json(c)
    note: plugins load from the plugins config array and .opencode/plugins directories; the run command has no plugin option
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode run command params source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20run%20command%20params%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The run command's parameter list in source (lines 400 to 451) has no option that names a plugin. A listing that lacks an option is evidence of absence, one step below its kind.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugins docs disable v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20disable%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs discover v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20discover%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs configure v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20configure%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins page says where plugins load from and how an entry disables one.
reportedIn:
  - "[OpenCode source commands commands.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20commands%20commands.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source plugins at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20plugins%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Session-only plugins](../../subjects/plugins/Session-only%20plugins.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

Read from source and docs at v2.3.0. Whether config given for one run through the environment can add a plugin was not checked.
