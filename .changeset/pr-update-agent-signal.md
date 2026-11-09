---
"@osdlc/pr-update": patch
---

SIGINT and SIGTERM now stop the repair agent. `pr-update` passes an abort signal to the agent call, starts no further repair or PR update once it fires, and exits 130 like `agent-call run`. Before, an interrupted run left the spawned agent running.
