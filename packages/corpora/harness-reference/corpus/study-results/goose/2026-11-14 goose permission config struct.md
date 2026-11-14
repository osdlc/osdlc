---
kind: source
reportedIn:
  - "[aaif-goose goose permission.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20permission.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/config/permission.rs#L29-L33 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: "pub struct PermissionConfig { pub always_allow: Vec<String>, // List of tools that are always allowed pub ask_before: Vec<String>, // List of tools that require user consent pub never_allow: Vec<String>, // List of tools that are never allowed }"
  prefix: "ze, Serialize, Default, Clone)] "
  suffix: " /// PermissionManager manages p"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> pub struct PermissionConfig { pub always_allow: Vec<String>, // List of tools that are always allowed pub ask_before: Vec<String>, // List of tools that require user consent pub never_allow: Vec<String>, // List of tools that are never allowed }
