---
kind: source
reportedIn:
  - "[openai codex ext skills src host_roots.rs at 086ccc8](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_roots.rs%20at%20086ccc8.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.0
version_basis: exact
observed: 2026-11-10
locator: codex-rs/ext/skills/src/host_roots.rs#L218-L225 at 086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a (repo_agents_skill_roots)
excerpt:
  exact: let directories = dirs_between_project_root_and_cwd(cwd, &project_root); let mut roots = Vec::new(); let mut missing = Vec::new(); let mut results = futures::stream::iter(directories) .map(|directory| { let repository_file_system = Arc::clone(&repository_file_system); async move { let agents_skills = directory.join(AGENTS_DIR_NAME).join(SKILLS_DIR_NAME);
  prefix: ", &project_root_markers).await; "
  suffix: " let agents_skills_uri = PathUri"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-10T00:00:00Z
---

> let directories = dirs_between_project_root_and_cwd(cwd, &project_root); let mut roots = Vec::new(); let mut missing = Vec::new(); let mut results = futures::stream::iter(directories) .map(|directory| { let repository_file_system = Arc::clone(&repository_file_system); async move { let agents_skills = directory.join(AGENTS_DIR_NAME).join(SKILLS_DIR_NAME);
