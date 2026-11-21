---
"@osdlc/host-cleaner": minor
---

The `claude-code` plugin: running Claude Code sessions as `session:<pid>` candidates with a `close-session` protest, never unattended. Closing one checks the pid's start time and command, sends SIGTERM and waits for the exit; it never sends SIGKILL.
