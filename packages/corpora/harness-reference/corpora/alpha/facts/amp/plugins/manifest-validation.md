---
type: Harness Fact
title: "Amp: Plugin manifest validation"
description: "Plugin manifest validation in Amp, as observed over time."
tags: [plugins]
harness: amp
subject: plugins/manifest-validation
observations:
  - value:
      applicable: false
      hosted_limits: "a plugin in a personal or workspace repository that exceeds the size or file-count limits is not loaded"
    since: null
    until: null
    observed: "2026-11-05"
    source: amp-plugins
    locator: "Writing Plugins; Hosted repository limits"
    evidence: inferred
    note: "Amp plugins have no manifest to validate. The hosted limits are the only load check the docs give for a plugin as a whole."
sources:
  - id: amp-plugins
    resource: "https://ampcode.com/docs/markdown/customize/plugins"
    title: "Amp docs: Plugins"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Amp](/harnesses/amp.md).

## Observations

- 2026-11-05: applicable: `false`, as Amp plugins have no manifest (inferred). A hosted plugin over
  the repository limits is not loaded.[^amp-plugins]

  > A plugin that exceeds a limit is not loaded. It does not appear in Settings or in new threads, even
  > though the push succeeds.

[^amp-plugins]: Amp docs: Plugins
