---
'@osdlc/agent-call': patch
---

Fixes from the review of the first release.

- A nonzero exit now reports the parser's text, the exit code and the end of stderr together in
  `error.detail`, instead of the parser's text alone.
- `templateAdapter` refuses at plan time when `promptVia` is `'argv'` and `args` has no
  `{prompt}` slot, or when `promptVia` is `'stdin'` and it has one.
- The claude adapter passes MCP server config (which can hold tokens) as a temp file instead of on
  the command line. codex still uses `-c` overrides; the README says so.
- The per-call temp directory is removed when a temp-file write fails. A `TempFile.name` that is
  empty or holds `/`, `\` or `..` is refused.
- A caller abort reports `aborted by the caller` instead of `killed after 0ms`.
- opencode sets `PlannedCall.prompt`.
- `detectAgents` uses the same runner as `callAgent`, so a `--version` probe that forks is
  cleaned up with its process group.
- The README and the docs now say that the agent runs in its own process group and keeps running
  if the host is interrupted unless the host aborts the call, that custom and template adapters
  note only `permissions.mode`, and that the live suite has no antigravity case.
