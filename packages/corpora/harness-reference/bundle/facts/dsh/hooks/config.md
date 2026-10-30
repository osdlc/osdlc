---
type: Harness Fact
title: "DeepSeek Harness (dsh): Hook configuration"
description: "Hook configuration in DeepSeek Harness (dsh), as observed over time."
tags: [hooks]
harness: dsh
subject: hooks/config
observations:
  - value: { kind: bridge that runs an unmodified Claude Code hooks.json (a Codex bridge exists too), enabled_by_default: false, config: "a YAML row with configPath, pluginRoot, projectDir" }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness packages/hooks/hooks-claude-code/README.md at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
    note: "Matchers apply to dsh's tool names, not Claude's."
open:
  - question: "How the hooks bridge's payload and exit-code semantics compare with Claude Code's, field by field."
    observed: "2026-10-08"
    source: notes-dsh
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Hook configuration](/subjects/hooks/config.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Where hooks are configured and whether they are shell
commands or code plugins.

## Observations

- 2026-10-08: kind: bridge that runs an unmodified Claude Code hooks.json (a Codex bridge exists
  too); enabled by default: `false`; config: a YAML row with configPath, pluginRoot, projectDir.
  Matchers apply to dsh's tool names, not Claude's.[^notes-dsh]

## Open questions

- How the hooks bridge's payload and exit-code semantics compare with Claude Code's, field by
  field.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
