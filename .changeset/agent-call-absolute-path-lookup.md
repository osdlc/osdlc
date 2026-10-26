---
'@osdlc/agent-call': minor
---

Behaviour change (stricter): a bare agent binary name (`claude`, `codex`, ...) is now looked up on the absolute entries of the child's `PATH` only, and the absolute path found is spawned. A relative or empty `PATH` entry (`.`, `bin`, `a::b`) is skipped, so an agent binary planted in the call's `cwd`, such as a pull request's checkout, is no longer run in place of the installed one. A name found only that way, or not at all, resolves `ok: false` with reason `spawn-failed` and a detail saying relative and empty `PATH` entries are skipped. A binary given as a path is still run as given. `detectAgents` probes through the same lookup.
New runtime dependency: `@osdlc/command-seam`, whose `which` does the lookup (with `PATHEXT` on Windows).
