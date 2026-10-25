---
'@osdlc/wayfinder': patch
---

The trust store now covers the old `waypost` store in `untrustAll`, `listGrants` and `tighten`, as it already did in `isTrusted`, `list` and `untrust`. Before, `untrustAll` left a grant made under the old name in place, so the repository stayed trusted.
