---
kind: source
reportedIn:
  - "[xai-org grok-build plugin-marketplace installer.rs](../../documents/github.com/xai-org%20grok-build%20plugin-marketplace%20installer.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-plugin-marketplace/src/installer.rs:348 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: if let Err(e) = std::fs::rename(&final_path, &backup_path) {
  prefix: ", final_path.display() ), }); } "
  suffix: " let _ = remove_path_if_exists(&"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if let Err(e) = std::fs::rename(&final_path, &backup_path) {
