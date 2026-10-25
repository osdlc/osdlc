---
"@osdlc/wayfinder": patch
---

Ctrl-C, `SIGTERM` and `SIGHUP` stop a running probe and the processes it started, in the CLI, the TUI and `way serve`. Each probe now runs in its own process group, so before this a probe kept running after wayfinder exited. The TUI also gives the terminal back on `SIGTERM` and `SIGHUP`. A `SIGINT` sent to the TUI now exits 130, as the CLI does, not 0. Ctrl-C and Esc typed in the TUI still exit 0.
