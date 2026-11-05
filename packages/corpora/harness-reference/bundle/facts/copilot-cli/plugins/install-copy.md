---
type: Harness Fact
title: "Copilot CLI: Plugin install copy"
description: "Plugin install copy in Copilot CLI, as observed over time."
tags: [plugins]
harness: copilot-cli
subject: plugins/install-copy
observations: []
open:
  - question: "When Copilot CLI installs a plugin (git or local path), does it copy the whole folder, and do exec bits and symlinks survive?"
    observed: "2026-11-04"
    source: copilot-cli-plugin-reference
sources:
  - id: copilot-cli-plugin-reference
    resource: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference"
    title: "Copilot docs: CLI plugin reference"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Copilot CLI](/harnesses/copilot-cli.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Open questions

- When Copilot CLI installs a plugin (git or local path), does it copy the whole folder, and do exec bits and symlinks survive?[^copilot-cli-plugin-reference]

[^copilot-cli-plugin-reference]: Copilot docs: CLI plugin reference
