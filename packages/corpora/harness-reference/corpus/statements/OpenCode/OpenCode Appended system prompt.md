---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/append-system-prompt
  object:
    supported: false
    basis: omitted-from-help
    note: opencode run takes a message, --continue, --session, --fork, --worktree, --model, --agent, --format, --file, --title, --archived, --thinking and the permission flags; none adds system text
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode run command params source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20run%20command%20params%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The run command's parameter list in source (lines 400 to 451) has no option that adds system or developer text. A listing that lacks an option is evidence of absence, one step below its kind.
reportedIn:
  - "[OpenCode source commands commands.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20commands%20commands.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

The `run` command in source at v2.3.0 lists no flag that adds text to the system prompt. Whether an agent selected with `--agent` carries its own prompt into a headless run was not checked here.
