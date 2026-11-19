---
kind: source
reportedIn:
  - "[aaif-goose goose plugins mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20plugins%20mod.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/plugins/mod.rs#L328-L333 at 2365bc5e898a38133c373eef2d1357416acd66e2 (clone_git_repo)
excerpt:
  exact: let output = git_command() .arg("clone") .arg("--depth") .arg("1") .arg(source) .arg(destination)
  prefix: "ination: &Path) -> Result<()> { "
  suffix: " .set_no_window() .output() .map"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let output = git_command() .arg("clone") .arg("--depth") .arg("1") .arg(source) .arg(destination)
