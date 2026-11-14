---
kind: source
reportedIn:
  - "[aaif-goose goose prompt_manager.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20prompt_manager.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/agents/prompt_manager.rs#L54-L56 at 2365bc5e898a38133c373eef2d1357416acd66e2 (SystemPromptBuilder::with_session)
excerpt:
  exact: self.system_prompt_override = session.system_prompt_override.clone(); self.prompt_extras .extend(session.system_prompt_extras.clone());
  prefix: "f, session: &Session) -> Self { "
  suffix: " self } pub fn with_extension(mu"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> self.system_prompt_override = session.system_prompt_override.clone(); self.prompt_extras .extend(session.system_prompt_extras.clone());
