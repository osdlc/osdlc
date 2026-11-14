---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: meta/lifecycle
  object:
    status: current
    note: OpenCode 2 is the current release line (v2.3.0 on 2026-11-13); it uses the same opencode command as OpenCode 1 and the two are not installed side by side by default
    carries_forward: supported V1 server config fields, agent definitions, command definitions, skills and other .opencode files; plugins, the server API and terminal client config changed
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode changelog 2.3.0 heading v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20changelog%202.3.0%20heading%20v2.3.0.md)"
      - "[2026-11-14 OpenCode migrate docs same command v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20migrate%20docs%20same%20command%20v2.3.0.md)"
      - "[2026-11-14 OpenCode migrate docs compatibility v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20migrate%20docs%20compatibility%20v2.3.0.md)"
      - "[2026-11-14 OpenCode migrate docs breaking changes v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20migrate%20docs%20breaking%20changes%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The changelog dates v2.3.0, and the migration page says what V2 keeps and what it breaks.
reportedIn:
  - "[OpenCode CHANGELOG at a6b15d3](../../documents/github.com/OpenCode%20CHANGELOG%20at%20a6b15d3.md)"
  - "[OpenCode docs source migrate-v1 at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20migrate-v1%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Lifecycle](../../subjects/meta/Lifecycle.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From the changelog and the V1 migration page at v2.3.0.
