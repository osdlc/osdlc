---
kind: source
reportedIn:
  - "[aaif-goose goose paths.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20paths.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/config/paths.rs#L41 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: Self::validated_path_root(std::env::var_os("GOOSE_PATH_ROOT"))
  prefix: "ath_root() -> Option<PathBuf> { "
  suffix: " } fn validated_path_root(value:"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> Self::validated_path_root(std::env::var_os("GOOSE_PATH_ROOT"))
