---
"@osdlc/agent-call": patch
---

Make `agent-call run` forward SIGINT and SIGTERM to the agent run, so interrupting the command kills the agent's process group instead of leaving it running. An interrupted run exits 130.
