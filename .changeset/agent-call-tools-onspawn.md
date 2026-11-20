---
'@osdlc/agent-call': minor
---

Add `permissions.tools`, the exact set of built-in tools (claude `--tools`, `--tools ""` for `[]`; dropped on the other adapters), also read from a run spec's `permissions.tools`. Add the `onSpawn` run option, called once after the process starts with its `pid` and `argv`.
