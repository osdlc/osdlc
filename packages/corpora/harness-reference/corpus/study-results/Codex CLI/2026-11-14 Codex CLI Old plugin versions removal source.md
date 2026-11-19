---
kind: source
reportedIn:
  - "[openai codex core-plugins src store.rs at ce21072](../../documents/github.com/openai%20codex%20core-plugins%20src%20store.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/core-plugins/src/store.rs#L711-L715 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (remove_old_plugin_versions)
excerpt:
  exact: if version == plugin_version || validate_plugin_version_segment(&version).is_err() { continue; } if fs::remove_dir_all(entry.path()).is_err()
  prefix: "to_string() else { continue; }; "
  suffix: " && old_plugin_version_would_sta"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if version == plugin_version || validate_plugin_version_segment(&version).is_err() { continue; } if fs::remove_dir_all(entry.path()).is_err()
