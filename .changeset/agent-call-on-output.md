---
"@osdlc/agent-call": minor
---

Add `onOutput` to `CallOptions`: a callback that gets the agent's output as it arrives, for a host that shows progress while a person waits. Each call gets a chunk of decoded UTF-8 text, whole characters only, and its stream (`'stdout'` or `'stderr'`); one stream's chunks join to exactly what `raw` collects. Output is still collected and parsed as before, and nothing is delivered past `maxOutputBytes`. A throw from the callback, or a rejection of a promise it returns, is swallowed, stops later calls for that run, and does not affect the result.
