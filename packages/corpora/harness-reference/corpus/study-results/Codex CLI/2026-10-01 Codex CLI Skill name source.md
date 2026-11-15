---
kind: source
reportedIn:
  - "[Codex README](../../documents/OpenAI/Codex%20README.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
observed: 2026-10-01
locator: codex-rs/skills/src/parser.rs:64-69, ext/skills/src/loader/environment.rs:385-386 at 57ac6f5
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:skills/name-source@codex#observation-1
---

Imported from `facts/codex/skills/name-source.md`, observation 1.

- rule: "frontmatter `name`, else the parent directory"
