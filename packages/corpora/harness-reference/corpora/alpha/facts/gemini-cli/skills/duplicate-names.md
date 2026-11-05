---
type: Harness Fact
title: "Gemini CLI: Duplicate skill names"
description: "Duplicate skill names in Gemini CLI, as observed over time."
tags: [skills]
harness: gemini-cli
subject: skills/duplicate-names
observations:
  - value: {"behavior": "higher-precedence location shadows lower", "order_low_to_high": ["built-in", "extension", "user", "workspace"], "within_scope": ".agents/skills alias takes precedence over .gemini/skills"}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: gemini-cli-skills
    resource: "https://geminicli.com/docs/cli/skills/"
    title: "Gemini CLI docs: Agent Skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Gemini CLI](/harnesses/gemini-cli.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: behavior: higher-precedence location shadows lower; order low to high: built-in, extension, user, workspace; within scope: .agents/skills alias takes precedence over .gemini/skills. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-skills]

  > If multiple skills share the same name, the version from the higher-precedence location is used.

[^gemini-cli-skills]: Gemini CLI docs: Agent Skills
