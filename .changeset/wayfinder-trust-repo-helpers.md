---
'@osdlc/wayfinder': patch
---

The `trust.paths` expander and the `origin` owner lookup now come from `@osdlc/trust-repo`. Behaviour is unchanged, with two fixes: `--no-exec` no longer runs `git remote get-url` for `trust.owners`, and the pattern `/*` now expands to `/*`, where it used to give `//*` and match nothing.

The trust store's `untrustAll`, `listGrants` and `tighten` now cover grants left in the old `waypost` store, as `isTrusted`, `list` and `untrust` already did. Before, `untrustAll` left a `waypost` grant in place, so the repository stayed trusted.
