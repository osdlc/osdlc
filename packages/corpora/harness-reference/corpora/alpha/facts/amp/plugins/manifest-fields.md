---
type: Harness Fact
title: "Amp: Plugin manifest fields"
description: "Plugin manifest fields in Amp, as observed over time."
tags: [plugins]
harness: amp
subject: plugins/manifest-fields
observations:
  - value:
      applicable: false
      plugin_form: "a .ts or .js file, or a directory with index.ts or index.js, whose default export receives the PluginAPI"
    since: null
    until: null
    observed: "2026-11-05"
    source: amp-plugins
    locator: "Writing Plugins; Bundle a Skill"
    evidence: inferred
    note: "The docs describe a plugin as code with an entry file and name no manifest file. Skills inside a plugin are registered from code, not declared."
sources:
  - id: amp-plugins
    resource: "https://ampcode.com/docs/markdown/customize/plugins"
    title: "Amp docs: Plugins"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Amp](/harnesses/amp.md).

## Observations

- 2026-11-05: applicable: `false`. An Amp plugin is a TypeScript or JavaScript module with no
  manifest; this is inferred from the docs, which describe only the entry file.[^amp-plugins]

  > A single-file plugin is a `.ts` or `.js` file directly inside a plugin location. A directory plugin
  > uses `<plugin-name>/index.ts` or `<plugin-name>/index.js`. If both entry files exist, Amp uses
  > `index.ts`.

  > Every plugin entry file exports a default function. Amp passes a `PluginAPI` object to that
  > function.

  > A directory plugin can include a standard skill and its resources. Amp does not scan the
  > `skills/` directory automatically, so the plugin must register each skill when it loads.

[^amp-plugins]: Amp docs: Plugins
