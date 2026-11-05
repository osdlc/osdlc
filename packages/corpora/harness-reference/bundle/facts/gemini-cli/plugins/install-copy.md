---
type: Harness Fact
title: "Gemini CLI: Plugin install copy"
description: "Plugin install copy in Gemini CLI, as observed over time."
tags: [plugins]
harness: gemini-cli
subject: plugins/install-copy
observations:
  - value: {"copies": true, "link_option": "symlink"}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-extensions-reference
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Do exec bits and symlinks inside an extension survive the install copy?"
    observed: "2026-11-04"
    source: gemini-cli-extensions-reference
sources:
  - id: gemini-cli-extensions-reference
    resource: "https://geminicli.com/docs/extensions/reference/"
    title: "Gemini CLI docs: Extension reference"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Gemini CLI](/harnesses/gemini-cli.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: copies: yes; link option: symlink. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-extensions-reference]

  > Gemini CLI creates a copy of the extension during installation.

## Open questions

- Do exec bits and symlinks inside an extension survive the install copy?[^gemini-cli-extensions-reference]

[^gemini-cli-extensions-reference]: Gemini CLI docs: Extension reference
