---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: cli/session-env
  object:
    vars:
      - GIT_EDITOR
      - HGEDITOR
      - JJ_EDITOR
      - PAGER
      - GIT_PAGER
      - JJ_PAGER
    note: "set for the commands the agent runs so they do not wait on an editor or a pager: the editor variables are false and JJ_PAGER is cat"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 changelog editor variables](../../study-results/Antigravity/2026-11-14%20changelog%20editor%20variables.md)"
      - "[2026-11-14 changelog pager variables](../../study-results/Antigravity/2026-11-14%20changelog%20pager%20variables.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: CLI changelog entries for 1.3.6 and 1.3.3 name the variables set for agent commands.
reportedIn:
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Session environment](../../subjects/cli/Session%20environment.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does the CLI export a variable that carries the conversation id, or one that marks a command as run by Antigravity?
---

The changelog names these six variables. It states the value of the editor variables (`false`) and of `JJ_PAGER` (`cat`), not of `PAGER` and `GIT_PAGER`. No source read names a variable that carries session data.
