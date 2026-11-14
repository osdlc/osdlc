---
kind: source
reportedIn:
  - "[xai-org grok-build subagent handle_request.rs](../../documents/github.com/xai-org%20grok-build%20subagent%20handle_request.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-shell/src/agent/subagent/handle_request.rs:1547-1551 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: if inherit_skills { ctx.parent_skills.take() } else { None },
  prefix: "lls::SkillsConfig::default() }, "
  suffix: " ctx.parent_compat, ctx.parent_p"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if inherit_skills { ctx.parent_skills.take() } else { None },
