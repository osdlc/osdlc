---
kind: source
reportedIn:
  - "[openai codex ext skills src host_roots.rs at 086ccc8](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_roots.rs%20at%20086ccc8.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.0
version_basis: exact
observed: 2026-11-10
locator: codex-rs/ext/skills/src/host_roots.rs#L119-L131 at 086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a (roots_from_layer_stack)
excerpt:
  exact: for layer in config_layer_stack.all_layers_high_to_low() { let Some(config_folder) = layer.config_folder() else { continue; }; match &layer.name { ConfigLayerSource::Project { .. } => { if let Some(repository_file_system) = &repository_file_system { roots.push(HostSkillRoot::host( config_folder.join(SKILLS_DIR_NAME), SkillScope::Repo,
  prefix: "> { let mut roots = Vec::new(); "
  suffix: " Arc::clone(repository_file_syst"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-10T00:00:00Z
---

> for layer in config_layer_stack.all_layers_high_to_low() { let Some(config_folder) = layer.config_folder() else { continue; }; match &layer.name { ConfigLayerSource::Project { .. } => { if let Some(repository_file_system) = &repository_file_system { roots.push(HostSkillRoot::host( config_folder.join(SKILLS_DIR_NAME), SkillScope::Repo,
