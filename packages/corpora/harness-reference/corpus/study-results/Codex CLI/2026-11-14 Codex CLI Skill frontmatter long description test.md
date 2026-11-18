---
kind: source
reportedIn:
  - "[openai codex skills src parser_tests.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser_tests.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/skills/src/parser_tests.rs#L109 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (preserves_overlong_descriptions_and_short_descriptions)
excerpt:
  exact: .expect("descriptions should not be truncated during frontmatter parsing");
  prefix: '), || "fallback".to_string(), ) '
  suffix: " assert_eq!( parsed, ParsedSkill"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> .expect("descriptions should not be truncated during frontmatter parsing");
