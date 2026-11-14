---
kind: source
reportedIn:
  - "[openai codex ext skills src extension.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20extension.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/ext/skills/src/extension.rs#L448-L454 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a
excerpt:
  exact: let (contents, truncated) = truncate_main_prompt_contents(read_result.contents.as_str()); if truncated { let warning = format!( "Skill `{}` exceeded the main prompt context limit and was truncated.", entry.name );
  prefix: ") .await { Ok(read_result) => { "
  suffix: " self.emit_warning( thread_store"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let (contents, truncated) = truncate_main_prompt_contents(read_result.contents.as_str()); if truncated { let warning = format!( "Skill `{}` exceeded the main prompt context limit and was truncated.", entry.name );
