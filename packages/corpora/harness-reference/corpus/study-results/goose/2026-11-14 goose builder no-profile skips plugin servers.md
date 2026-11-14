---
kind: source
reportedIn:
  - "[aaif-goose goose session builder.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20session%20builder.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/session/builder.rs#L593-L596 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: if !session_config.no_profile && !session_config.resume && recipe_extensions.is_none() { let project_root = std::env::current_dir().ok(); all.extend( goose::plugins::mcp_servers::enabled_plugin_mcp_servers(project_root.as_deref())
  prefix: "ig.name(), config)) .collect(); "
  suffix: " .into_iter() .map(|config| (con"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if !session_config.no_profile && !session_config.resume && recipe_extensions.is_none() { let project_root = std::env::current_dir().ok(); all.extend( goose::plugins::mcp_servers::enabled_plugin_mcp_servers(project_root.as_deref())
