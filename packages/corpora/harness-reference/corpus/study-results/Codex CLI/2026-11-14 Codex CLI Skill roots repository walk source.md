---
kind: source
reportedIn:
  - "[openai codex ext skills src host_roots.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_roots.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/ext/skills/src/host_roots.rs#L240-L244 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (repo_agents_skill_roots)
excerpt:
  exact: Ok(metadata) if metadata.is_directory => roots.push(HostSkillRoot::host( agents_skills, SkillScope::Repo, Arc::clone(&repository_file_system), )),
  prefix: "s.next().await { match result { "
  suffix: " Ok(_) => complete = false, Err("
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> Ok(metadata) if metadata.is_directory => roots.push(HostSkillRoot::host( agents_skills, SkillScope::Repo, Arc::clone(&repository_file_system), )),
