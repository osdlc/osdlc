---
'@osdlc/agent-call': minor
---

New experimental `interactiveArgv(tool, spec)`: the command line of an interactive session (claude, codex, cursor, pi, opencode), with the first message guarded behind `--`, beside the headless adapters. `hasInteractiveArgv` says which tools have one. Claude's session flags move here too: `claudeSessionArgv`, `claudeResumeArgv`, `claudeHookSettings`, `CLAUDE_HOOK_EVENTS` and the `ClaudeSessionFlags`, `ClaudeLaunchFlags` and `InteractiveSpec` types. Existing calls are unchanged.
