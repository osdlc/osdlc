---
"@osdlc/host-cleaner": minor
---

The `claude-code` adapter, built into the `host-cleaner` command. It lists running Claude Code sessions as `session:<pid>` rows (pid, start time, command, cwd, `resumeId`, transcript `lastWrite`, `duplicateOf`, `orphan`, `worktree`), always `review` with the `close-session` risk. `clean --pick session:<pid> --allow close-session` checks the pid still has the planned start time and command, sends SIGTERM and waits for it to exit; nothing sends SIGKILL and no session is ever closed unattended. The transcript folder comes from detect-harness. Exported as `claudeAdapter` and `createClaudeAdapter`.
