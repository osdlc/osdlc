---
kind: source
reportedIn:
  - "[openai codex core-plugins src store.rs at ce21072](../../documents/github.com/openai%20codex%20core-plugins%20src%20store.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/core-plugins/src/store.rs#L650-L653 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (replace_plugin_root_atomically)
excerpt:
  exact: fs::rename(&staged_version_root, &target_version_root).map_err(|err| { PluginStoreError::io("failed to activate updated plugin cache version", err) })?; remove_old_plugin_versions(target_root, plugin_version)?;
  prefix: "!target_version_root.exists() { "
  suffix: " return Ok(()); } if target_root"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> fs::rename(&staged_version_root, &target_version_root).map_err(|err| { PluginStoreError::io("failed to activate updated plugin cache version", err) })?; remove_old_plugin_versions(target_root, plugin_version)?;
