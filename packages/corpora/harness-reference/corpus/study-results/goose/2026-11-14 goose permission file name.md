---
kind: source
reportedIn:
  - "[aaif-goose goose permission.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20permission.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/config/permission.rs#L13 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: 'const PERMISSION_FILE: &str = "permission.yaml";'
  prefix: "le::NamedTempFile; use tracing; "
  suffix: " static PERMISSION_MANAGER: Lazy"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const PERMISSION_FILE: &str = "permission.yaml";
