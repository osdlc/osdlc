---
kind: source
reportedIn:
  - "[xai-org grok-build skills discovery.rs](../../documents/github.com/xai-org%20grok-build%20skills%20discovery.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-tools/src/implementations/skills/discovery.rs:350-357 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: "!name.is_empty() && name.len() <= MAX_NAME_LEN && !name.starts_with('-') && !name.ends_with('-') && !name.contains(\"--\") && name .chars() .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')"
  prefix: "kill_name(name: &str) -> bool { "
  suffix: " } /// Wrap simple `key: value` "
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> !name.is_empty() && name.len() <= MAX_NAME_LEN && !name.starts_with('-') && !name.ends_with('-') && !name.contains("--") && name .chars() .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
