---
'@osdlc/trust-repo': minor
---

`list` and `listGrants` no longer report a whole-repository grant from a stray or renamed marker file (`old-repo`, an editor's `repo~`), which `isTrusted` never read and `untrustAll` never removed.
`homeDir` and `expandTilde` are now `@osdlc/tiered-dirs`'s (a new runtime dependency). Behaviour change: `homeDir` throws a `TieredDirsError` (code `MISSING_BASE_DIR`) instead of a plain `Error` when no absolute home can be found; the home it returns is unchanged.
