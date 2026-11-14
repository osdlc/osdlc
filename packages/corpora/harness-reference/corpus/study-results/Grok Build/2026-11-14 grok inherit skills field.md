---
kind: source
reportedIn:
  - "[xai-org grok-build agent config.rs](../../documents/github.com/xai-org%20grok-build%20agent%20config.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-agent/src/config.rs:721-723 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: "/// Whether to inherit the parent session's discovered skills when spawned as a subagent. Ignored for primary sessions. #[serde(default = \"default_true\")] pub inherit_skills: bool,"
  prefix: 'e")] pub discover_skills: bool, '
  suffix: ' #[serde(default = "default_true'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> /// Whether to inherit the parent session's discovered skills when spawned as a subagent. Ignored for primary sessions. #[serde(default = "default_true")] pub inherit_skills: bool,
