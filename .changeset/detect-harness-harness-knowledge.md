---
"@osdlc/detect-harness": patch
---

Codex's user-scope skills folder (`~/.agents/skills`) is now read from `@osdlc/harness-knowledge`. Behaviour is unchanged; the other location facts stay in the table and a test asserts them against the knowledge file.
