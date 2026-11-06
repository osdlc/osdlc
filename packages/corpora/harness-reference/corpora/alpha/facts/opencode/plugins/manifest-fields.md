---
type: Harness Fact
title: "OpenCode: Plugin manifest fields"
description: "Plugin manifest fields in OpenCode, as observed over time."
tags: [plugins]
harness: opencode
subject: plugins/manifest-fields
observations:
  - value:
      file: package.json
      fields:
        - { name: name, type: string, required: "conditional", use: "package name; resolves exports for a local directory, and is the id of a plugin with no server part", note: "A local directory is resolved through package.json only when both name and exports are set; otherwise OpenCode uses root file names." }
        - { name: exports, type: object, required: "conditional", use: "maps the plugin parts to files", note: "See name." }
        - { name: "exports[\".\"]", type: string, required: false, use: "server part, also read as exports[\"./server\"]" }
        - { name: "exports[\"./server\"]", type: string, required: false, use: "server part; tried before \".\"" }
        - { name: "exports[\"./tui\"]", type: string, required: false, use: "terminal UI part" }
        - { name: "exports[\"./rpc\"]", type: string, required: false, use: "typed RPC contract the other parts call" }
        - { name: "exports[\"./gui-experimental\"]", type: string, required: false, use: "prebuilt CommonJS bundle for OpenCode Desktop; must end in .js or .cjs" }
      fallback_files: "server (else index), tui, rpc with .ts, .tsx or .js; gui-experimental.cjs or gui-experimental.js"
      plugin_id: "set by Plugin.define in the server part, not by the manifest"
    since: null
    until: null
    observed: "2026-11-05"
    source: opencode-source
    locator: "packages/plugin/src/host.ts:25-92 at 32ece823b820702961a7538ff02891f3791615c2"
    evidence: source
  - value:
      docs_fields:
        - { name: version, type: string, required: false, use: "not documented; shown in the example package.json" }
        - { name: type, type: string, required: false, use: "not documented; module in the example" }
        - { name: files, type: "string[]", required: false, use: "must include the built GUI bundle when publishing" }
        - { name: dependencies, type: object, required: false, use: "carries the @opencode/plugin SDK" }
    since: null
    until: null
    observed: "2026-11-05"
    source: opencode-build-plugins-doc
    locator: "services/www/src/docs/content/build/plugins/index.mdx:22-106 at 32ece823b820702961a7538ff02891f3791615c2"
    evidence: docs
  - value: { published_docs_manifest: none, published_docs_note: "the published plugins page describes a plugin as a JavaScript or TypeScript module listed under the plugin key, with no manifest file" }
    since: null
    until: null
    observed: "2026-11-05"
    source: opencode-plugins-published
    locator: "packages/web/src/content/docs/plugins.mdx:36-80 at 32ece823b820702961a7538ff02891f3791615c2"
    evidence: docs
    note: "The published opencode.ai page and the in-repo docs for the next site describe two different plugin formats."
sources:
  - id: opencode-source
    resource: "https://github.com/anomalyco/opencode/blob/32ece823b820702961a7538ff02891f3791615c2/packages/plugin/src/host.ts"
    title: "anomalyco/opencode plugin host.ts at 32ece82"
  - id: opencode-build-plugins-doc
    resource: "https://github.com/anomalyco/opencode/blob/32ece823b820702961a7538ff02891f3791615c2/services/www/src/docs/content/build/plugins/index.mdx"
    title: "OpenCode docs source: Build plugins overview at 32ece82"
  - id: opencode-plugins-published
    resource: "https://github.com/anomalyco/opencode/blob/32ece823b820702961a7538ff02891f3791615c2/packages/web/src/content/docs/plugins.mdx"
    title: "OpenCode docs source for opencode.ai/docs/plugins at 32ece82"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[OpenCode](/harnesses/opencode.md).

At this commit the repository holds two plugin formats. The code and the in-repo docs for the next
site use a `package.json` whose `name` and `exports` locate the plugin's parts. The page published
at opencode.ai/docs/plugins still describes plugins as plain modules with no manifest.

## Observations

- 2026-11-05: file: `package.json`; fields read: name, exports (subpaths `.`, `./server`, `./tui`,
  `./rpc`, `./gui-experimental`). Both are needed for a local directory to resolve through them;
  without them OpenCode looks for root files by name.[^opencode-source]

  ```ts
    // A local directory whose package.json names the package and maps `exports` resolves through them, like the
    // published package; without them it uses the conventional file names at its root.
    const manifest = input.name ? undefined : packageManifest(input.directory)
    const target =
      typeof manifest?.name === "string" && manifest.exports !== undefined ? { ...input, name: manifest.name } : input
  ...
    return {
      server: entry(["server", ""]),
      tui: entry(["tui"]),
      rpc: entry(["rpc"]),
      gui: [target.name ? entry(["gui-experimental"]) : entry(["gui-experimental.cjs", "gui-experimental.js"])].find(
  ...
  // The fields resolution reads from a local directory's package.json.
  const Manifest = Schema.fromJsonString(
    Schema.Struct({ name: Schema.optional(Schema.Unknown), exports: Schema.optional(Schema.Unknown) }),
  )
  ```

- 2026-11-05: the in-repo build docs show version, type, files and dependencies in the example
  package.json; files must carry the built GUI bundle.[^opencode-build-plugins-doc]

  > - Build the GUI bundle before you publish, and include it through `files`.

  > The plugin's `id` comes from its server part's `Plugin.define`. A package with a GUI part and no server part takes its
  > package name (or a local directory's name) as its `id`.

- 2026-11-05: the docs source for the published plugins page describes a plugin as a module, with
  no manifest. This conflicts with the code at the same commit.[^opencode-plugins-published]

  > A plugin is a **JavaScript/TypeScript module** that exports one or more plugin

[^opencode-source]: anomalyco/opencode plugin host.ts at 32ece82
[^opencode-build-plugins-doc]: OpenCode docs source: Build plugins overview at 32ece82
[^opencode-plugins-published]: OpenCode docs source for opencode.ai/docs/plugins at 32ece82
