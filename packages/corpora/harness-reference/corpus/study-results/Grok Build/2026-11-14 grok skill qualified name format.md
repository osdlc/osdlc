---
kind: source
reportedIn:
  - "[xai-org grok-build skills skill.rs](../../documents/github.com/xai-org%20grok-build%20skills%20skill.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-tools/src/implementations/skills/skill.rs:137 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: // Plugin skills use "plugin-name:skill-name" so skills from different
  prefix: "(skill: &SkillInfo) -> String { "
  suffix: " // plugins don't collide. Other"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> // Plugin skills use "plugin-name:skill-name" so skills from different
