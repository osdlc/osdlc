---
type: Harness Fact
title: "Qwen Code: Plugin install copy"
description: "Plugin install copy in Qwen Code, as observed over time."
tags: [plugins]
harness: qwen-code
subject: plugins/install-copy
observations:
  - value: {"copies": true, "symlinks": "installed copies replace each symlink with the file it points to; link install skips symlinked workflow files"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-extensions
    evidence: docs
    note: "Symlink handling quoted from a summary of the page. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Do exec bits survive the install copy?"
    observed: "2026-11-04"
    source: qwen-code-extensions
sources:
  - id: qwen-code-extensions
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction/"
    title: "Qwen Code docs: Extensions"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Qwen Code](/harnesses/qwen-code.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: copies: yes; symlinks: installed copies replace each symlink with the file it points to; link install skips symlinked workflow files. Symlink handling quoted from a summary of the page. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-extensions]

  > we create a copy of the installed extension

## Open questions

- Do exec bits survive the install copy?[^qwen-code-extensions]

[^qwen-code-extensions]: Qwen Code docs: Extensions
