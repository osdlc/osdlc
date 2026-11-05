---
type: Harness Fact
title: "Antigravity CLI: Plugin install copy"
description: "Plugin install copy in Antigravity CLI, as observed over time."
tags: [plugins]
harness: antigravity
subject: plugins/install-copy
observations:
  - value: {"unpacked_read_only": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-build-plugins
    evidence: docs
    note: "Quote is quoted inside the summary. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Do exec bits and symlinks survive install?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-build-plugins
    resource: "https://antigravity.google/docs/build-plugins/"
    title: "Antigravity docs: Build plugins"
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Antigravity CLI](/harnesses/antigravity.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: unpacked read only: yes. Quote is quoted inside the summary. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-build-plugins]

  > Installed plugins are unpacked into a read-only directory: "that is replaced when the plugin updates."

## Open questions

- Do exec bits and symlinks survive install?[^antigravity-skills]

[^antigravity-build-plugins]: Antigravity docs: Build plugins
[^antigravity-skills]: Antigravity docs: Agent skills
