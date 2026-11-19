---
"@osdlc/agent-seat": minor
---

`harnessArgv`, `harnessAvailable` and `SessionRequest.binary` accept a launcher prefix such as `['npx', '-y', 'claude']` as well as one binary word; the prefix leads the argv and the session flags follow it. The pure per-host argv builders (`orcaCreateArgv`, `cmuxCreateArgv`, `ottyCreateArgv`, `herdrWorkspaceCreateArgv`, `weztermSpawnArgv`, `tmuxCreateArgv` and their send, focus, close, list and read companions) are now exported from the package entry.
