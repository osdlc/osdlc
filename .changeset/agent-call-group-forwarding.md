---
"@osdlc/agent-call": minor
---

The agent's process group is now registered with `@osdlc/command-seam`. A host that calls `installGroupSignalForwarding()` once has SIGINT, SIGTERM and SIGHUP kill the agent (and what it started) before the host exits; before, the agent, in its own group, outlived a Ctrl-C or kill of the host unless the host passed a `signal`. Once such a signal has been forwarded, `callAgent` starts no agent and resolves `ok: false` with reason `spawn-failed`. Passing `signal` still works, and the timeout and abort kills are unchanged.
