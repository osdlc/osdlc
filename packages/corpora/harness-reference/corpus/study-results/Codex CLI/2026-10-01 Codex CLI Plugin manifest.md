---
kind: source
reportedIn:
  - "[Codex README](../../documents/OpenAI/Codex%20README.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
observed: 2026-10-01
locator: codex-rs/core-plugins/src/manifest.rs:37-40, exec-server-protocol/src/protocol.rs:51-55, core-plugins/src/loader.rs:1081-1100 at 57ac6f5
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:plugins/manifest@codex#observation-2
---

Imported from `facts/codex/plugins/manifest.md`, observation 2.

- files: ["plugin.json (Agent Plugins root)",".codex-plugin/plugin.json (legacy)"]
- legacy_discovery_also: [".claude-plugin/plugin.json",".cursor-plugin/plugin.json"]
- skills: "manifest-declared paths win, else `skills/`"
