---
'@osdlc/agent-call': minor
---

Adds `none` and `minimal` effort levels below `low`. codex and opencode pass them through; claude and antigravity raise them to `low` and record an approximation note. The claude launch argv helper does the same, and the pi launch argv helper sends `none` as `off`.
