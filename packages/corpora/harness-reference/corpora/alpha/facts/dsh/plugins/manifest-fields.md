---
type: Harness Fact
title: "DeepSeek Harness (dsh): Plugin manifest fields"
description: "Plugin manifest fields in DeepSeek Harness (dsh), as observed over time."
tags: [plugins]
harness: dsh
subject: plugins/manifest-fields
observations:
  - value:
      file: package.json
      fields:
        - { name: name, type: string, required: true, use: "published npm package name" }
        - { name: version, type: string, required: true, use: "published npm package version" }
        - { name: description, type: string, required: false, use: "package summary for discovery and display" }
        - { name: icon, type: string, required: false, use: "plugin icon: an SVG, PNG, JPEG or WebP file inside the package, at most 256 KiB" }
        - { name: private, type: boolean, required: false, use: "prevents npm publication, for example for local profiles" }
        - { name: dependencies, type: "Record<string, string>", required: false, use: "packages installed alongside" }
        - { name: optionalDependencies, type: "Record<string, string>", required: false, use: "packages that install or platform checks may skip" }
        - { name: peerDependencies, type: "Record<string, string>", required: false, use: "compatible versions supplied by the consuming project" }
        - { name: engines.dsh, type: string, required: false, use: "compatible DSH versions as a SemVer range; not enforced" }
        - { name: engines.node, type: string, required: false, use: "compatible Node.js versions" }
        - { name: engines.npm, type: string, required: false, use: "compatible npm versions" }
        - { name: dsh.manifestVersion, type: "1", required: false, use: "manifest format version; not enforced" }
        - { name: dsh.bundle.patch, type: "string | string[]", required: "conditional", use: "patch files applied in order as one bundle layer", note: "Required when dsh.bundle is set; a package without dsh.bundle installs as a plain dependency, not a profile layer." }
        - { name: dsh.bundle.platforms, type: "string[]", required: false, use: "Node Host platform names the bundle supports; omission allows every OS; enforced before composing" }
        - { name: dsh.bundle.listedByDefault, type: boolean, required: false, use: "show the bundle in GUI lists before the profile enables it; default true" }
        - { name: dsh.profile.bundles, type: "string[]", required: false, use: "ordered bundle layers of a profile directory" }
        - { name: dsh.client.platform, type: string, required: "conditional", use: "client platform id; the Web consumer selects web", note: "Required when dsh.client is set." }
        - { name: dsh.client.inject, type: "string[]", required: false, use: "informational package-name dependencies" }
        - { name: dsh.client.immediately, type: boolean, required: false, use: "boot phase-one registration barrier" }
        - { name: dsh.client.external, type: "string[]", required: false, use: "module-table requests beyond the client baseline" }
      note: "Local profile readers accept a partial manifest, so name and version are not required there."
    since: null
    until: null
    observed: "2026-11-05"
    source: dsh-package-manifest-source
    locator: "packages/util/package-manifest/src/types.ts:8-100 at fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159"
    evidence: source
sources:
  - id: dsh-package-manifest-source
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/util/package-manifest/src/types.ts"
    title: "deepseek-ai/deepseek-harness package-manifest types.ts at fcc0ad4"
  - id: dsh-package-manifest-readme
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/util/package-manifest/README.md"
    title: "deepseek-ai/deepseek-harness package-manifest README at fcc0ad4"
open:
  - question: "The README names internal configTrees, sessionFormatMigration and moduleFallback metadata that the public types leave out. Where do they live in package.json, and may a third-party package set them?"
    observed: "2026-11-05"
    source: dsh-package-manifest-readme
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md).

A dsh plugin is an npm package. Its manifest is `package.json`, with dsh fields under `dsh`.

## Observations

- 2026-11-05: file: `package.json`; fields: name, version (required), description, icon, private,
  dependencies, optionalDependencies, peerDependencies, engines.dsh, engines.node, engines.npm,
  dsh.manifestVersion, dsh.bundle (patch, platforms, listedByDefault), dsh.profile.bundles,
  dsh.client (platform, inject, immediately, external).[^dsh-package-manifest-source]

  ```ts
  export interface DshPackageManifest {
    /** Published npm package name. */
    name: string
    /** Published npm package version. */
    version: string
    description?: string
    /** SVG, PNG, JPEG, or WebP file relative to this manifest's directory, at most 256 KiB ... */
    icon?: string
    private?: boolean
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    engines?: DshEnginesManifest
    dsh?: DshManifest
  }
  export interface DshManifest {
    manifestVersion?: 1
    bundle?: DshBundleManifest
    profile?: DshProfileManifest
    client?: DshClientManifest
  }
  export interface DshBundleManifest {
    platforms?: string[]
    /** One patch file path, or an ordered list applied in sequence, each relative to the declaring package root. */
    patch: string | string[]
    listedByDefault?: boolean
  }
  export interface DshProfileManifest {
    bundles?: string[]
  }
  export interface DshClientManifest {
    platform: string
    inject?: string[]
    immediately?: boolean
    external?: string[]
  }
  ```

## Open questions

- The README names internal `configTrees`, `sessionFormatMigration` and `moduleFallback` metadata
  that the public types leave out. Their place in package.json is not stated.[^dsh-package-manifest-readme]

  > Internal `configTrees`, `sessionFormatMigration`, and generated `moduleFallback` metadata remain owned by their image-packer, catalog, and launcher readers; the public types do not expose them.

[^dsh-package-manifest-source]: deepseek-ai/deepseek-harness package-manifest types.ts at fcc0ad4
[^dsh-package-manifest-readme]: deepseek-ai/deepseek-harness package-manifest README at fcc0ad4
