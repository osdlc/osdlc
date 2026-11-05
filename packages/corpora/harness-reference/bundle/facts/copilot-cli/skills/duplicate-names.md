---
type: Harness Fact
title: "Copilot CLI: Duplicate skill names"
description: "Duplicate skill names in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/duplicate-names
observations:
  - value: {"result": "first found wins; deduplicated by name", "order": "project skill directories, personal skills, plugin skills directories, then COPILOT_SKILLS_DIRS and config"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-plugin-reference
    locator: "Loading order"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"across_scopes": "project over personal"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-config-dir-reference
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"result": "first found wins for duplicate names; built-in skills lowest priority"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-command-reference
    locator: "Skill locations"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: copilot-cli-plugin-reference
    resource: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference"
    title: "Copilot docs: CLI plugin reference"
  - id: copilot-cli-config-dir-reference
    resource: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference"
    title: "Copilot docs: CLI config directory reference"
  - id: copilot-cli-command-reference
    resource: "https://docs.github.com/en/copilot/reference/cli-command-reference"
    title: "Copilot docs: CLI command reference"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Copilot CLI](/harnesses/copilot-cli.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: result: first found wins; deduplicated by name; order: project skill directories, personal skills, plugin skills directories, then COPILOT_SKILLS_DIRS and config. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-plugin-reference]

  > Agents and skills use first-found-wins precedence.
- 2026-11-04: across scopes: project over personal. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-config-dir-reference]

  > Project-level skills take precedence over personal skills if they share the same name.
- 2026-11-04: result: first found wins for duplicate names; built-in skills lowest priority. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-command-reference]

  > Skills are loaded from these locations in priority order (first found wins for duplicate names).

[^copilot-cli-plugin-reference]: Copilot docs: CLI plugin reference
[^copilot-cli-config-dir-reference]: Copilot docs: CLI config directory reference
[^copilot-cli-command-reference]: Copilot docs: CLI command reference
