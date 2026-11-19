---
"@osdlc/agent-seat": minor
---

cmux host: `makeCmuxHost({ binary })` names the `cmux` binary (or `null` for none) instead of finding it only on PATH, and a launch with a `sessionId` records `agent-seat:<slug>` in the workspace's `--description`. `find`, `send`, `focus`, `capture` and `close` with that `sessionId` pick the workspace carrying the marker, so two sessions in one worktree can be told apart; without a marker match they fall back to the working directory as before.
