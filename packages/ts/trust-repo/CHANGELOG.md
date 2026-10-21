# @osdlc/trust-repo

## 0.2.0

### Minor Changes

- d093384: First release. Per-repository consent to run a repository's own scripts: a marker store kept under the XDG state directory, an exec gate that combines a configured value, a per-run flag and the store, and a policy of path globs and owners layered over the markers. It moved here from `@osdlc/cli-tool/trust`.
