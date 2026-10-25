---
'@osdlc/wayfinder': patch
---

Ctrl-C, `SIGTERM` and `SIGHUP` stop a running probe and the processes it started, in the CLI, the TUI and `--serve`. Each probe now runs in its own process group, so before this a probe kept running after wayfinder exited. The TUI also gives the terminal back on `SIGTERM` and `SIGHUP`.
