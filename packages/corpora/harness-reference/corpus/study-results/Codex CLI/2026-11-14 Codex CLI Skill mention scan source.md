---
kind: source
reportedIn:
  - "[openai codex skills src selection.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20selection.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/skills/src/selection.rs#L98-L99 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (collect_explicit_skill_mentions)
excerpt:
  exact: if let UserInput::Text { text, .. } = input { let mentioned_names = extract_tool_mentions(text);
  prefix: "e()); } } for input in inputs { "
  suffix: " select_skills_from_mentions( &s"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if let UserInput::Text { text, .. } = input { let mentioned_names = extract_tool_mentions(text);
