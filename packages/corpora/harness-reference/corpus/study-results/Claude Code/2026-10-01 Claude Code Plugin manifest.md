---
kind: docs
reportedIn:
  - "[Claude Code docs plugins reference](../../documents/code.claude.com/Claude%20Code%20docs%20plugins%20reference.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-10-01
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:plugins/manifest@claude-code#observation-1
---

Imported from `facts/claude-code/plugins/manifest.md`, observation 1.

- file: ".claude-plugin/plugin.json"
- skills_layout: "skills/<name>/SKILL.md"
- optional: true

Without plugin.json the plugin name comes from the marketplace entry or the `--plugin-dir` directory.
