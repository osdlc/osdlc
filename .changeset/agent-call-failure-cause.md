---
"@osdlc/agent-call": minor
---

A failed run now says why. `CallError.cause` (experimental) is `{ kind: 'auth' }`, `{ kind: 'rate-limit', resetAt, limit }` or `{ kind: 'quota' }` when the adapter can tell, and `AgentAdapter` gains an optional `classifyFailure`. The claude, codex and cursor adapters implement it. The cursor out-of-credit wording is an unverified guess.

Two new experimental functions serve a caller that spawned the CLI itself: `classifyFailure(agent, output, { now })` returns the cause of a failed run, and `parseOutput(agent, stdout, format, options)` returns the same fields as `parseResult` without a `PlannedCall`, with `model` read from claude's `modelUsage`. Both take an adapter or a built-in agent name and never throw.
