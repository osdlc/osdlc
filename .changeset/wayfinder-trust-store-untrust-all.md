---
'@osdlc/wayfinder': patch
---

The trust store's new `untrustAll`, `listGrants` and `tighten`, from `@osdlc/trust-repo`, cover the old `waypost` store too, as `isTrusted`, `list` and `untrust` do. So removing every grant for a repository also removes a grant made under the old name.
