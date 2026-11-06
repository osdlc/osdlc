---
type: Harness Fact
title: "Amp: Marketplace fields"
description: "Marketplace fields in Amp, as observed over time."
tags: [plugins]
harness: amp
subject: plugins/marketplace-fields
observations:
  - value:
      applicable: false
      distribution: "share URLs and hosted personal and workspace plugin repositories"
    since: null
    until: null
    observed: "2026-11-05"
    source: amp-plugins
    locator: "Adding Plugins; Global Plugin Repositories"
    evidence: inferred
    note: "The docs name no catalog file; plugins are shared by URL, imported into a hosted git repository, or installed from a URL with amp plugins add."
sources:
  - id: amp-plugins
    resource: "https://ampcode.com/docs/markdown/customize/plugins"
    title: "Amp docs: Plugins"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Amp](/harnesses/amp.md).

## Observations

- 2026-11-05: applicable: `false`. Amp shares plugins by URL and hosted repositories, and the docs
  name no catalog file; this is inferred.[^amp-plugins]

  > For most plugins, import a shared plugin into your personal plugins. Personal plugins are available
  > everywhere you use Amp. Paste the plugin's share URL into a thread and ask Amp to import it:

  > Personal and workspace plugins live in global plugin repositories. Your personal plugin repository
  > applies only to you. Workspace admins manage the workspace repository, whose plugins apply to
  > everyone in the workspace.

[^amp-plugins]: Amp docs: Plugins
