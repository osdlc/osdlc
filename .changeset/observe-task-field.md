---
'@osdlc/observe': patch
---

Add an optional `task` field to the `launched` event and to the session record. It holds the basename of the task the session works on. The reducer copies it to the record. When `task` is `null` or missing, the record has no `task`, so older logs still read.
