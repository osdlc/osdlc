---
type: Harness Fact
title: "Qwen Code: Plugin install location"
description: "Plugin install location in Qwen Code, as observed over time."
tags: [plugins]
harness: qwen-code
subject: plugins/install-location
observations:
  - value: {"path": "~/.qwen/extensions", "local_path_install": "copied"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-extensions
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: qwen-code-extensions
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction/"
    title: "Qwen Code docs: Extensions"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Qwen Code](/harnesses/qwen-code.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: path: ~/.qwen/extensions; local path install: copied. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-extensions]

  > On startup, Qwen Code looks for extensions in `<home>/.qwen/extensions`.

[^qwen-code-extensions]: Qwen Code docs: Extensions
