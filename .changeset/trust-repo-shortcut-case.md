---
'@osdlc/trust-repo': patch
---

`originOwner` now matches the `github:`, `gitlab:` and similar shortcut prefixes case-insensitively. A remote such as `GitHub:///evil/x` or `GitHub://x/evil/x` returned an owner like `github.com/evil`; it now returns null.
