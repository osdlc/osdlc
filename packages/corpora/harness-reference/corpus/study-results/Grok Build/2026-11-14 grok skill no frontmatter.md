---
kind: source
reportedIn:
  - "[xai-org grok-build skills discovery.rs](../../documents/github.com/xai-org%20grok-build%20skills%20discovery.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-tools/src/implementations/skills/discovery.rs:694-695 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: Err(SkillParseError::NoFrontmatter) => { let name = fallback_name.map(normalize_skill_name);
  prefix: "k_name) { Ok(parsed) => parsed, "
  suffix: " match name { Some(name) if is_v"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> Err(SkillParseError::NoFrontmatter) => { let name = fallback_name.map(normalize_skill_name);
