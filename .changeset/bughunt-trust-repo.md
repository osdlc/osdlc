---
'@osdlc/trust-repo': minor
---

`list` and `listGrants` no longer report a whole-repository grant from a stray or renamed marker file (`old-repo`, an editor's `repo~`), which `isTrusted` never read and `untrustAll` never removed.
