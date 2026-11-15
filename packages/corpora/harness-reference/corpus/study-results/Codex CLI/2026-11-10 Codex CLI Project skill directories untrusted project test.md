---
kind: source
reportedIn:
  - "[openai codex ext skills src host_roots_tests.rs at 086ccc8](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_roots_tests.rs%20at%20086ccc8.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.0
version_basis: exact
observed: 2026-11-10
locator: codex-rs/ext/skills/src/host_roots_tests.rs#L281-L326 at 086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a (layer_roots_preserve_scope_precedence_and_disabled_projects)
excerpt:
  exact: 'ConfigLayerEntry::new_disabled( ConfigLayerSource::Project { dot_codex_folder: project_folder.clone(), }, empty_config(), "untrusted project", ),'
  prefix: "), ), user_layer(&user_folder), "
  suffix: " project_layer(&nested_project_f"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-10T00:00:00Z
---

> ConfigLayerEntry::new_disabled( ConfigLayerSource::Project { dot_codex_folder: project_folder.clone(), }, empty_config(), "untrusted project", ),
