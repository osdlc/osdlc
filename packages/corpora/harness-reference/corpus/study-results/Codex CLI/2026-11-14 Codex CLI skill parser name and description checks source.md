---
kind: source
reportedIn:
  - "[Codex source skills parser.rs at rust-v0.169.0](../../documents/github.com/Codex%20source%20skills%20parser.rs%20at%20rust-v0.169.0.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.169.0
version_basis: exact
observed: 2026-11-14
locator: "#L82-L85"
excerpt:
  exact: validate_len(&name, MAX_NAME_LEN, "name")?; if description.is_empty() { return Err(SkillParseError::MissingField("description")); }
  prefix: "ter(|value| !value.is_empty()); "
  suffix: " Ok(ParsedSkillFrontmatter { nam"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> validate_len(&name, MAX_NAME_LEN, "name")?; if description.is_empty() { return Err(SkillParseError::MissingField("description")); }
