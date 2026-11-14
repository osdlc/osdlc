---
kind: source
reportedIn:
  - "[openai codex ext skills src host_roots.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_roots.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/ext/skills/src/host_roots.rs#L125-L129 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (roots_from_layer_stack)
excerpt:
  exact: ConfigLayerSource::Project { .. } => { if let Some(repository_file_system) = &repository_file_system { roots.push(HostSkillRoot::host( config_folder.join(SKILLS_DIR_NAME), SkillScope::Repo,
  prefix: "ontinue; }; match &layer.name { "
  suffix: " Arc::clone(repository_file_syst"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> ConfigLayerSource::Project { .. } => { if let Some(repository_file_system) = &repository_file_system { roots.push(HostSkillRoot::host( config_folder.join(SKILLS_DIR_NAME), SkillScope::Repo,
