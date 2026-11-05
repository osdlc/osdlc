---
type: Harness Fact
title: "Grok Build: Old plugin versions"
description: "Old plugin versions in Grok Build, as observed over time."
tags: [plugins]
harness: grok-build
subject: plugins/upgrade-retention
observations: []
open:
  - question: "After grok plugin update, do older plugin versions stay on disk?"
    observed: "2026-11-04"
    source: grok-build-plugins
sources:
  - id: grok-build-plugins
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md"
    title: "Grok Build user guide: Plugins"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [Grok Build](/harnesses/grok-build.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Open questions

- After grok plugin update, do older plugin versions stay on disk?[^grok-build-plugins]

[^grok-build-plugins]: Grok Build user guide: Plugins
