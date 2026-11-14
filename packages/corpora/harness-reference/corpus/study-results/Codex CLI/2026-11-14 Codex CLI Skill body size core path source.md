---
kind: source
reportedIn:
  - "[openai codex ext skills src host_prompt.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_prompt.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/ext/skills/src/host_prompt.rs#L79-L83 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (load_skill_prompts)
excerpt:
  exact: let (contents, truncated) = if self.outcome().is_agent_plugin_skill(skill) { truncate_main_prompt_contents(&contents) } else { (contents, false) };
  prefix: "kill).await { Ok(contents) => { "
  suffix: " if truncated { prompts.warnings"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let (contents, truncated) = if self.outcome().is_agent_plugin_skill(skill) { truncate_main_prompt_contents(&contents) } else { (contents, false) };
