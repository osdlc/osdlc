---
'@osdlc/agent-seat': patch
---

`harnessArgv`, `hasInteractiveArgv`, `claudeSessionArgv`, `claudeResumeArgv`, `claudeHookSettings` and `CLAUDE_HOOK_EVENTS` now delegate to `@osdlc/agent-call`, which owns each CLI's command line. Same exports and the same argv.
