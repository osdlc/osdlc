---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: instructions/rules
  object:
    supported: true
    dir: AGENTS.md in any directory below the workspace
    attach_by: the agent reading a file or listing a directory at or below that directory
    note: these are nested AGENTS.md files, not a separate rules folder or frontmatter; the instructions config array adds files, globs or URLs that load with the AGENTS.md files
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode instructions docs nested AGENTS.md v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20instructions%20docs%20nested%20AGENTS.md%20v2.3.0.md)"
      - "[2026-11-14 OpenCode instructions docs instructions array v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20instructions%20docs%20instructions%20array%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The instructions page at v2.3.0 says nested AGENTS.md files load when the agent reads or lists their area, and describes the instructions array.
reportedIn:
  - "[OpenCode docs source instructions at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20instructions%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Rules and steering files](../../subjects/instructions/Rules%20and%20steering%20files.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

OpenCode has no rule file format of its own. The scoped mechanism the docs describe is a nested `AGENTS.md`.
