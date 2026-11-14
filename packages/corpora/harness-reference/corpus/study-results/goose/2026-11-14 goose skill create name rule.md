---
kind: source
reportedIn:
  - "[aaif-goose goose skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skills%20mod.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/skills/mod.rs#L85-L93 at 2365bc5e898a38133c373eef2d1357416acd66e2 (validate_skill_name)
excerpt:
  exact: if name.len() > 64 { return Err(Error::invalid_params().data(format!( "Invalid skill name \"{}\". Names must be at most 64 characters.", name ))); } if !name .chars() .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
  prefix: 'll name must not be empty")); } '
  suffix: " { return Err(Error::invalid_par"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if name.len() > 64 { return Err(Error::invalid_params().data(format!( "Invalid skill name \"{}\". Names must be at most 64 characters.", name ))); } if !name .chars() .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
