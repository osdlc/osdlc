---
'@osdlc/agent-call': minor
---

An argument list Node rejects before it starts anything (a NUL byte in argv or env, say) now resolves the call as a spawn failure, the same as a missing binary, instead of throwing. A `timeoutMs` of `Infinity` now means no timeout, and a value above 2^31-1 ms is capped at that; before, either killed the agent at once.
