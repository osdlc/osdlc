---
kind: docs
reportedIn:
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
observed: 2026-11-04
locator: Loading order
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/duplicate-names@copilot-cli#observation-1
---

Imported from `facts/copilot-cli/skills/duplicate-names.md`, observation 1.

- result: "first found wins; deduplicated by name"
- order: "project skill directories, personal skills, plugin skills directories, then COPILOT_SKILLS_DIRS and config"

Read through a fetch tool that summarises, so the quoted wording may be paraphrased.
