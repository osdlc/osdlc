---
kind: source
reportedIn:
  - "[openai codex ext skills src fragments.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20fragments.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/ext/skills/src/fragments.rs#L124-L126 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (SkillInstructions::body)
excerpt:
  exact: input_text(format!( "\n<name>{name}</name>\n<path>{path}</path>{resource_access}\n{contents}\n" ))
  prefix: 'ess>") }) .unwrap_or_default(); '
  suffix: " } }"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> input_text(format!( "\n<name>{name}</name>\n<path>{path}</path>{resource_access}\n{contents}\n" ))
