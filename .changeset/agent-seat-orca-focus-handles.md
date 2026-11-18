---
"@osdlc/agent-seat": minor
---

Orca host: `SessionRequest` and `CommandRequest` take `focus` (default true); `focus: false` opens the terminal in the background. The create no longer passes `--focus`, which can time out while Orca adopts a worktree with the terminal already open; the host switches to the new terminal afterwards, once the create returned its handle. `parseOrcaCreatedHandle` also reads `result.handle` and `result.terminalId`, and `find`, `send`, `focus` and `close` list again with `--limit` of `totalCount` when Orca truncated the first page of 100. `orcaFindArgv` takes an optional `limit`.
