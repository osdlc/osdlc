---
kind: source
reportedIn:
  - "[openai codex skills src parser.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/skills/src/parser.rs#L82-L85 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (parse_skill_frontmatter_metadata)
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
