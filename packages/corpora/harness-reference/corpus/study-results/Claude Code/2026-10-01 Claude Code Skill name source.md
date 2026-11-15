---
kind: docs
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
version: 2.1.286
version_basis: exact
observed: 2026-10-01
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:skills/name-source@claude-code#observation-1
---

Imported from `facts/claude-code/skills/name-source.md`, observation 1.

- rule: "frontmatter `name` if set, else the directory name"
- root_skill_needs_name: true

A SKILL.md at a plugin root has no directory fallback and needs `name`.
