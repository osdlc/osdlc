---
kind: source
reportedIn:
  - "[openai codex skills src parser_tests.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser_tests.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/skills/src/parser_tests.rs#L64-L66 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (repairs_unrecognized_frontmatter_fields_that_need_quotes)
excerpt:
  exact: 'fn repairs_unrecognized_frontmatter_fields_that_need_quotes() { let parsed = parse_skill_frontmatter_metadata( "---\nname: unknown\ndescription: Unknown fields\nargument-hint: <duration: e.g. 7d, 2w>\ntags: [next,@supabase/ssr]\n---\n",'
  prefix: 's".to_string()), } ); } #[test] '
  suffix: ' || "fallback".to_string(), ) .e'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> fn repairs_unrecognized_frontmatter_fields_that_need_quotes() { let parsed = parse_skill_frontmatter_metadata( "---\nname: unknown\ndescription: Unknown fields\nargument-hint: <duration: e.g. 7d, 2w>\ntags: [next,@supabase/ssr]\n---\n",
