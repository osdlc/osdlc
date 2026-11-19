---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: false
    note: the instructions option lists extra instruction files, and an agent config can carry a prompt
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Instructions option docs](../../study-results/OpenCode/2026-11-09%20OpenCode%20Instructions%20option%20docs.md)"
      - "[2026-11-09 OpenCode Agent prompt docs](../../study-results/OpenCode/2026-11-09%20OpenCode%20Agent%20prompt%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: The config docs list the instructions option and an agent prompt, and no system prompt flag. Absence in docs is weak.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode run command all params source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20run%20command%20all%20params%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The whole run command definition at v2.3.0 lists message, continue, session, fork, worktree, model, agent, format, file, title, archived, thinking and the permission flags, and no system prompt flag. A source listing that lacks the option is one step below strong.
reportedIn:
  - "[OpenCode source commands commands.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20commands%20commands.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-14T18:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - "What does the top-level `--prompt` flag set at v2.3.0: the first user message, or a system prompt?"
---

Checked against the run command definition at v2.3.0 on 2026-11-14: it defines no system prompt flag. The top-level command has a `--prompt` flag, described as "Prompt to use"; it was not traced, so it is not counted as a system prompt flag here.
