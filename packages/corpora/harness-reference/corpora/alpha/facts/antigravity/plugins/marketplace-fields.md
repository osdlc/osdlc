---
type: Harness Fact
title: "Antigravity CLI: Marketplace fields"
description: "Marketplace fields in Antigravity CLI, as observed over time."
tags: [plugins]
harness: antigravity
subject: plugins/marketplace-fields
observations:
  - value: { marketplaces: [antigravity-plugins-official], listing: "the plugins page describes no catalog file an author writes" }
    since: null
    until: null
    observed: "2026-11-05"
    source: antigravity-plugins
    locator: "CLI shell subcommands (agy plugin)"
    evidence: docs
  - value: { intake_form_build_plugins: "submit through the Antigravity Marketplace partner intake form" }
    since: null
    until: null
    observed: "2026-11-05"
    source: antigravity-build-plugins
    locator: "Publish to the Antigravity Marketplace"
    evidence: docs
  - value: { interest_form_marketplace: "interest form to submit a validated plugin to the Antigravity Marketplace" }
    since: null
    until: null
    observed: "2026-11-05"
    source: antigravity-marketplace
    locator: "Get your plugin in the marketplace"
    evidence: docs
open:
  - question: "Does Antigravity read a marketplace catalog file, and if so, what are its fields? The docs name only the official marketplace and a submission form. Our own probe of https://antigravity.google/schemas/v1/marketplace.json returned 404."
    observed: "2026-11-05"
    source: antigravity-plugins
sources:
  - id: antigravity-plugins
    resource: "https://antigravity.google/docs/plugins.md"
    title: "Antigravity docs: Plugins"
  - id: antigravity-build-plugins
    resource: "https://antigravity.google/docs/build-plugins.md"
    title: "Antigravity docs: Build plugins"
  - id: antigravity-marketplace
    resource: "https://antigravity.google/docs/marketplace.md"
    title: "Antigravity docs: Marketplace"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Antigravity CLI](/harnesses/antigravity.md).

## Observations

- 2026-11-05: the only marketplace is `antigravity-plugins-official`. The Build plugins page says to
  submit a plugin through the Antigravity Marketplace partner intake form; the Marketplace page
  links an interest form for the same purpose. The docs describe no catalog file
  format.[^antigravity-plugins][^antigravity-build-plugins][^antigravity-marketplace]

  > # Install from the official marketplace (<marketplace-name> only supports antigravity-plugins-official)
  > agy plugin install <plugin-name>@antigravity-plugins-official

  > submit it through the [Antigravity Marketplace partner intake form](https://forms.gle/2EX5RFYPoJe1UgxR9).

  > **[Get your plugin in the marketplace](https://forms.gle/2EX5RFYPoJe1UgxR9)**: Fill out this interest form to submit your validated plugin to the Antigravity Marketplace.

## Open questions

- Does Antigravity read a marketplace catalog file, and what are its fields? Our own probe, not a
  statement in the cited pages: a request for
  `https://antigravity.google/schemas/v1/marketplace.json` returned 404.[^antigravity-plugins]

[^antigravity-plugins]: Antigravity docs: Plugins
[^antigravity-build-plugins]: Antigravity docs: Build plugins
[^antigravity-marketplace]: Antigravity docs: Marketplace
