---
type: Harness Fact
title: "OpenCode: Plugin manifest validation"
description: "Plugin manifest validation in OpenCode, as observed over time."
tags: [plugins]
harness: opencode
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: ignored
      invalid_fields: "a package.json that is not a JSON object counts as missing, and the directory falls back to root file names; a name that is not a string does the same; a GUI entry that is not .js or .cjs is not loaded"
    since: null
    until: null
    observed: "2026-11-05"
    source: opencode-source
    locator: "packages/plugin/src/host.ts:28-30, 60-63, 81-92 at 32ece823b820702961a7538ff02891f3791615c2"
    evidence: source
open:
  - question: "Does OpenCode ship a validator or published JSON Schema for a plugin package? opencode plugin check looks for updates; no validate command or plugin schema was found."
    observed: "2026-11-05"
    source: opencode-source
sources:
  - id: opencode-source
    resource: "https://github.com/anomalyco/opencode/blob/32ece823b820702961a7538ff02891f3791615c2/packages/plugin/src/host.ts"
    title: "anomalyco/opencode plugin host.ts at 32ece82"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [OpenCode](/harnesses/opencode.md).

## Observations

- 2026-11-05: unknown fields: ignored (only name and exports are decoded). A broken package.json
  is treated as absent so one bad plugin directory does not stop the rest.[^opencode-source]

  ```ts
  // A package.json that is not a JSON object counts as missing, so one broken plugin directory never stops the rest
  // from resolving: it falls back to the conventional root file names.
  function packageManifest(directory: string) {
    const file = path.join(directory, "package.json")
    if (!existsSync(file)) return undefined
    return Option.getOrUndefined(Schema.decodeUnknownOption(Manifest)(readFileSync(file, "utf8")))
  }
  ```

## Open questions

- Does OpenCode ship a validator or a published JSON Schema for a plugin package? None was found.[^opencode-source]

[^opencode-source]: anomalyco/opencode plugin host.ts at 32ece82
