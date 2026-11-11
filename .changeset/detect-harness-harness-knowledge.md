---
"@osdlc/detect-harness": patch
---

Codex's user-scope skills folder (`~/.agents/skills`) is now read from `@osdlc/harness-knowledge`. detect-harness now depends on `@osdlc/harness-knowledge`. Codex's project skills now include `.codex/skills` beside `.agents/skills`, as the knowledge file states. The other location facts stay in the table and a test asserts them against the knowledge file.
