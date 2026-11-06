---
type: Harness Fact
title: "OpenCode: Marketplace fields"
description: "Marketplace fields in OpenCode, as observed over time."
tags: [plugins]
harness: opencode
subject: plugins/marketplace-fields
observations:
  - value: { applicable: false, note: "plugins are npm packages, npm-compatible git specs or local directories listed under plugins in opencode.json(c); the docs describe no catalog file" }
    since: null
    until: null
    observed: "2026-11-05"
    source: opencode-plugins-doc
    locator: "services/www/src/docs/content/plugins.mdx at 32ece823b820702961a7538ff02891f3791615c2"
    evidence: docs
open:
  - question: "Does OpenCode have any marketplace or catalog of plugins beyond npm? Neither docs set mentions one."
    observed: "2026-11-05"
    source: opencode-plugins-doc
sources:
  - id: opencode-plugins-doc
    resource: "https://github.com/anomalyco/opencode/blob/32ece823b820702961a7538ff02891f3791615c2/services/www/src/docs/content/plugins.mdx"
    title: "OpenCode docs source: Plugins at 32ece82"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[OpenCode](/harnesses/opencode.md).

## Observations

- 2026-11-05: applicable: `false`. Plugins are named directly in config by package or path; the
  docs describe no catalog file.[^opencode-plugins-doc]

  > Add published packages, versioned packages, scoped packages, or local plugin directories to `opencode.json(c)`.

  > Package installation accepts npm names with versions, tags, or ranges, plus npm-compatible Git package specifications.

## Open questions

- Does OpenCode have any plugin catalog beyond npm? Neither docs set mentions one.[^opencode-plugins-doc]

[^opencode-plugins-doc]: OpenCode docs source: Plugins at 32ece82
