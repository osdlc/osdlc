---
type: Harness Fact
title: "Antigravity CLI: Old plugin versions"
description: "Old plugin versions in Antigravity CLI, as observed over time."
tags: [plugins]
harness: antigravity
subject: plugins/upgrade-retention
observations:
  - value: {"old_version_kept": false, "mechanism": "the read-only plugin directory is replaced on update"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-build-plugins
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does anything else retain the prior version on disk?"
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

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [Antigravity CLI](/harnesses/antigravity.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Observations

- 2026-11-04: old version kept: no; mechanism: the read-only plugin directory is replaced on update. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-build-plugins]

  > that is replaced when the plugin updates.

## Open questions

- Does anything else retain the prior version on disk?[^antigravity-skills]

[^antigravity-build-plugins]: Antigravity docs: Build plugins
[^antigravity-skills]: Antigravity docs: Agent skills
