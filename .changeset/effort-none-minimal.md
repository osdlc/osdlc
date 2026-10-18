---
'@osdlc/agent-call': minor
---

**Breaking:** adds `none` and `minimal` to `EffortLevel` and `EFFORT_LEVELS`, below `low`. An exhaustive `switch` or a `Record<EffortLevel, …>` must now handle them. codex and opencode pass them through; claude and antigravity raise them to `low` and record an approximation note. The claude launch argv helper does the same, and the pi launch argv helper sends `none` as `off`.
