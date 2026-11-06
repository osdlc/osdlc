---
type: Harness Fact
title: "pi: Plugin manifest fields"
description: "Plugin manifest fields in pi, as observed over time."
tags: [plugins]
harness: pi
subject: plugins/manifest-fields
observations:
  - value:
      file: package.json
      fields:
        - { name: pi.extensions, type: "string[]", required: false, use: "extension entry files; globs and exclusions accepted; default extensions directory" }
        - { name: pi.skills, type: "string[]", required: false, use: "skill directories; globs and exclusions accepted; default skills directory" }
        - { name: pi.prompts, type: "string[]", required: false, use: "prompt template files; default prompts directory" }
        - { name: pi.themes, type: "string[]", required: false, use: "theme files; default themes directory" }
        - { name: pi.changelogPath, type: string, required: false, use: "changelog shown after an update; default CHANGELOG.md; empty string disables it" }
      note: "The pi block is optional: without it pi discovers the conventional directories. Only these five keys are read from it."
    since: null
    until: null
    observed: "2026-11-05"
    source: pi-source
    locator: "packages/coding-agent/src/core/pi-manifest.ts:4-42 at 2a32a605a9f18a5f0191f65358a2e764b2f69fc7"
    evidence: source
  - value:
      docs_fields:
        - { name: name, type: string, required: false, use: "package name; identifies an npm package" }
        - { name: version, type: string, required: false, use: "matched against changelog headings; npm update checks" }
        - { name: keywords, type: "string[]", required: false, use: "the pi-package keyword lists an npm package in the pi.dev gallery" }
        - { name: pi.image, required: false, use: "gallery preview" }
        - { name: pi.video, required: false, use: "gallery preview" }
        - { name: dependencies, type: object, required: false, use: "installed with an npm or git source; host-provided packages here draw a warning" }
        - { name: peerDependencies, type: object, required: false, use: "host-provided pi packages, declared with a * range" }
    since: null
    until: null
    observed: "2026-11-05"
    source: pi-packages-doc
    locator: "packages/coding-agent/docs/packages.md:61-114 at 2a32a605a9f18a5f0191f65358a2e764b2f69fc7"
    evidence: docs
open:
  - question: "What type do pi.image and pi.video take, and what reads them? The docs name them as gallery preview fields; the loader does not read them."
    observed: "2026-11-05"
    source: pi-packages-doc
sources:
  - id: pi-source
    resource: "https://github.com/earendil-works/pi/blob/2a32a605a9f18a5f0191f65358a2e764b2f69fc7/packages/coding-agent/src/core/pi-manifest.ts"
    title: "earendil-works/pi pi-manifest.ts at 2a32a60"
  - id: pi-packages-doc
    resource: "https://github.com/earendil-works/pi/blob/2a32a605a9f18a5f0191f65358a2e764b2f69fc7/packages/coding-agent/docs/packages.md"
    title: "pi docs: Pi Packages at 2a32a60"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[pi](/harnesses/pi.md).

A pi package is an ordinary directory or npm package. Its manifest is the `pi` key in
`package.json`, and it is optional.

## Observations

- 2026-11-05: file: `package.json`; fields read by the loader: pi.extensions, pi.skills, pi.prompts,
  pi.themes (string arrays) and pi.changelogPath (string). None is required.[^pi-source]

  ```ts
  export interface PiManifest {
  	extensions?: string[];
  	skills?: string[];
  	prompts?: string[];
  	themes?: string[];
  	changelogPath?: string;
  }

  const RESOURCE_FIELDS = ["extensions", "skills", "prompts", "themes"] as const;
  ```

- 2026-11-05: the docs also use the standard package.json fields name, version, keywords,
  dependencies and peerDependencies, and name two gallery fields, pi.image and pi.video, that the
  loader does not read. The docs give no type for the gallery fields.[^pi-packages-doc]

  > The `pi-package` keyword makes an npm package eligible for discovery in the [Pi package gallery](https://pi.dev/packages). Optional `pi.image` and `pi.video` fields add gallery previews.

  > By default Pi reads `CHANGELOG.md` from the package root. Point `pi.changelogPath` at another file inside the package, or set it to `""` to disable the changelog:

  > Declare the host-provided packages listed above in `peerDependencies` with a `"*"` range and do not bundle them.

## Open questions

- What type do pi.image and pi.video take, and what reads them? The loader does not.[^pi-packages-doc]

[^pi-source]: earendil-works/pi pi-manifest.ts at 2a32a60
[^pi-packages-doc]: pi docs: Pi Packages at 2a32a60
