---
type: Harness Fact
title: "Grok Build: Plugin install copy"
description: "Plugin install copy in Grok Build, as observed over time."
tags: [plugins]
harness: grok-build
subject: plugins/install-copy
observations:
  - value: {"helper_scripts": "copied to the machine with the plugin", "vendored_marketplace_plugins": "copied from the marketplace repository checkout"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-plugins
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md:364 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
open:
  - question: "Do exec bits and symlinks inside a plugin survive install?"
    observed: "2026-11-04"
    source: grok-build-plugins
sources:
  - id: grok-build-plugins
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md"
    title: "Grok Build user guide: Plugins"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Grok Build](/harnesses/grok-build.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: helper scripts: copied to the machine with the plugin; vendored marketplace plugins: copied from the marketplace repository checkout.[^grok-build-plugins]

  > Plugins vendored directly inside a marketplace repository are copied from that repository's checkout

## Open questions

- Do exec bits and symlinks inside a plugin survive install?[^grok-build-plugins]

[^grok-build-plugins]: Grok Build user guide: Plugins
