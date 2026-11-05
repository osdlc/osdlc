---
type: Harness Fact
title: "Gemini CLI: Plugin install location"
description: "Plugin install location in Gemini CLI, as observed over time."
tags: [plugins]
harness: gemini-cli
subject: plugins/install-location
observations:
  - value: {"path": "<home>/.gemini/extensions", "local_install": "copied", "link_command": "symlink to the development directory"}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-extensions-reference
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: gemini-cli-extensions-reference
    resource: "https://geminicli.com/docs/extensions/reference/"
    title: "Gemini CLI docs: Extension reference"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Gemini CLI](/harnesses/gemini-cli.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: path: <home>/.gemini/extensions; local install: copied; link command: symlink to the development directory. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-extensions-reference]

  > Gemini CLI loads extensions from `<home>/.gemini/extensions`.

[^gemini-cli-extensions-reference]: Gemini CLI docs: Extension reference
