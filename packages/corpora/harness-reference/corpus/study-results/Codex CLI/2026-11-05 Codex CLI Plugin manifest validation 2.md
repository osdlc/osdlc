---
kind: source
reportedIn:
  - "[openai codex core-plugins source at a037e65](../../documents/github.com/openai%20codex%20core-plugins%20source%20at%20a037e65.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
observed: 2026-11-05
locator: codex-rs/core-plugins/src/marketplace.rs:388-412, 521-537, 600-627 at a037e65ead8f6789f960e9450bfe6af5a87a0053
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@codex#observation-2
---

Imported from `facts/codex/plugins/manifest-validation.md`, observation 2.

- marketplace_unknown_fields: "top level ignored; in a plugin entry, kept as fallback manifest metadata"
- marketplace_invalid_fields: "a wrong type in a parsed field fails the whole marketplace file; an unsupported or unresolvable source, or an invalid plugin name, skips that entry with a warning"
