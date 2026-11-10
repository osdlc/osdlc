---
"@osdlc/pr-update": patch
---

`pr-update update` now installs `@osdlc/command-seam`'s process-group signal forwarding. SIGINT, SIGTERM or SIGHUP while the repair agent runs kills the agent's group, starts no further repair or PR update, records no failed attempt for the interrupted run, and exits `128 + signal` (130 for SIGINT, 143 for SIGTERM). A second signal is SIGKILL. Before, an interrupted run left the spawned agent running. `survey` is unchanged. Between agent runs (git and `gh` steps, the verify command) pr-update holds no process group, so a signal there ends it as before.
