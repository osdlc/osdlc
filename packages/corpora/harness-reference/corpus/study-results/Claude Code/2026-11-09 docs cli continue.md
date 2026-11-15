---
kind: docs
reportedIn:
  - "[Claude Code docs CLI reference](../../documents/code.claude.com/Claude%20Code%20docs%20CLI%20reference.md)"
version: 2.1.319
version_basis: inferred
locator: CLI flags, --continue
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-09
excerpt:
  exact: --continue, -c Load the most recent conversation in the current directory, including a background session that has finished; opening finished background sessions requires Claude Code v2.1.257 or later. Skips sessions created with claude -p or the Agent SDK, and sessions whose first prompt was /loop. claude -p --continue includes -p, SDK, and /loop sessions. Includes sessions that added this directory with /add-dir
  prefix: 'ude --cloud "Fix the login bug" '
  suffix: " claude --continue --dangerously"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
---

> --continue, -c Load the most recent conversation in the current directory, including a background session that has finished; opening finished background sessions requires Claude Code v2.1.257 or later. Skips sessions created with claude -p or the Agent SDK, and sessions whose first prompt was /loop. claude -p --continue includes -p, SDK, and /loop sessions. Includes sessions that added this directory with /add-dir
