---
kind: source
reportedIn:
  - "[xai-org grok-build agent config.rs](../../documents/github.com/xai-org%20grok-build%20agent%20config.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-agent/src/config.rs:1530-1531 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: "prompt_body: Some(subagent_prompts::EXPLORE_PROMPT.to_string()), inherit_skills: false,"
  prefix: "ion_mode: PermissionMode::Plan, "
  suffix: " ..Self::base(BuiltinAgentName::"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> prompt_body: Some(subagent_prompts::EXPLORE_PROMPT.to_string()), inherit_skills: false,
