---
kind: source
reportedIn:
  - "[xai-org grok-build plugins git_install.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20git_install.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-agent/src/plugins/git_install.rs:718 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: cmd.args(["pull", "--ff-only"]).current_dir(repo_path);
  prefix: "= xai_tty_utils::git_command(); "
  suffix: " let output = cmd.output().map_e"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> cmd.args(["pull", "--ff-only"]).current_dir(repo_path);
