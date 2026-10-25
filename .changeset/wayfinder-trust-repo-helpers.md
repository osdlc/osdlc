---
'@osdlc/wayfinder': patch
---

The `trust.paths` expander and the `origin` owner lookup now come from `@osdlc/trust-repo`. Behaviour is unchanged, with two exceptions. `--no-exec` no longer runs `git remote get-url` for `trust.owners`. And a `trust.paths` pattern of `/*` now expands to `/*`; it used to give `//*`, which matched nothing.
