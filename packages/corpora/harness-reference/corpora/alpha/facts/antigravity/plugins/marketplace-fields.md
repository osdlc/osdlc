---
type: Harness Fact
title: "Antigravity CLI: Marketplace fields"
description: "Marketplace fields in Antigravity CLI, as observed over time."
tags: [plugins]
harness: antigravity
subject: plugins/marketplace-fields
observations:
  - value: { marketplaces: [antigravity-plugins-official], listing: "partner intake form; the docs describe no catalog file an author writes" }
    since: null
    until: null
    observed: "2026-11-05"
    source: antigravity-plugins
    locator: "CLI shell subcommands (agy plugin)"
    evidence: docs
open:
  - question: "Does Antigravity read a marketplace catalog file, and if so, what are its fields? The docs name only the official marketplace and a submission form, and no catalog schema is published beside the plugin schema."
    observed: "2026-11-05"
    source: antigravity-plugins
sources:
  - id: antigravity-plugins
    resource: "https://antigravity.google/docs/plugins.md"
    title: "Antigravity docs: Plugins"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Antigravity CLI](/harnesses/antigravity.md).

## Observations

- 2026-11-05: the only marketplace is `antigravity-plugins-official`. Plugins reach it through a
  partner intake form. The docs describe no catalog file format.[^antigravity-plugins]

  > # Install from the official marketplace (<marketplace-name> only supports antigravity-plugins-official)
  > agy plugin install <plugin-name>@antigravity-plugins-official

## Open questions

- Does Antigravity read a marketplace catalog file, and what are its fields? A request for
  `https://antigravity.google/schemas/v1/marketplace.json` returned 404.[^antigravity-plugins]

[^antigravity-plugins]: Antigravity docs: Plugins
