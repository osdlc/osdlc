---
kind: source
reportedIn:
  - "[openai codex core-plugins src manager.rs at ce21072](../../documents/github.com/openai%20codex%20core-plugins%20src%20manager.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/core-plugins/src/manager.rs#L2375-L2379 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a
excerpt:
  exact: set_user_plugin_enabled( &self.codex_home, result.plugin_id.as_key(), /*enabled*/ true, )
  prefix: "rr(PluginInstallError::join)??; "
  suffix: " .await .map_err(anyhow::Error::"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> set_user_plugin_enabled( &self.codex_home, result.plugin_id.as_key(), /*enabled*/ true, )
