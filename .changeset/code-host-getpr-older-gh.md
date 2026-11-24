---
"@osdlc/code-host": patch
---

`getPr` on the GitHub host works again with gh older than v2.63.0: its field list comes from typed-gh's `PR_VIEW_FIELDS`, which no longer asks for `baseRefOid`.
