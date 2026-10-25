---
'@osdlc/wayfinder': patch
---

The `trust.paths` expander and the `origin` owner lookup now come from `@osdlc/trust-repo`. Behaviour is unchanged, except that `--no-exec` no longer runs `git remote get-url` for `trust.owners`.
