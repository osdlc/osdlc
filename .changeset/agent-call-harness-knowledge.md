---
"@osdlc/agent-call": minor
---

The adapters' binary names, flags and permission-mode arguments are now asserted against the harness knowledge file by a test. Fixes the research showed wrong: Antigravity passes `context.dirs` with `--add-dir` and `permissions.mode: edits` with `--mode accept-edits`; dsh passes `context.dirs` with `--add-dir`, no longer restates the `{{cwd}}` persona suffix that fails prompt assembly, and says its read-only mode needs a configured preset (dsh ships none); opencode 2.x has no `--variant`, so `opencodeAdapter({ version: '2.x' })` sends the effort as a `#variant` suffix on `--model`. Without `version` opencode keeps `--variant`.
