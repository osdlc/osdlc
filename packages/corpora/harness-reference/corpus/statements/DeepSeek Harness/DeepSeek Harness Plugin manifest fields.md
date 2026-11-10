---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: plugins/manifest-fields
  object:
    file: package.json
    fields:
      - name: name
        type: string
        required: true
        use: published npm package name
      - name: version
        type: string
        required: true
        use: published npm package version
      - name: description
        type: string
        required: false
        use: package summary for discovery and display
      - name: icon
        type: string
        required: false
        use: "plugin icon: an SVG, PNG, JPEG or WebP file inside the package, at most 256 KiB"
      - name: private
        type: boolean
        required: false
        use: prevents npm publication, for example for local profiles
      - name: dependencies
        type: Record<string, string>
        required: false
        use: packages installed alongside
      - name: optionalDependencies
        type: Record<string, string>
        required: false
        use: packages that install or platform checks may skip
      - name: peerDependencies
        type: Record<string, string>
        required: false
        use: compatible versions supplied by the consuming project
      - name: engines.dsh
        type: string
        required: false
        use: compatible DSH versions as a SemVer range; not enforced
      - name: engines.node
        type: string
        required: false
        use: compatible Node.js versions
      - name: engines.npm
        type: string
        required: false
        use: compatible npm versions
      - name: dsh.manifestVersion
        type: "1"
        required: false
        use: manifest format version; not enforced
      - name: dsh.bundle.patch
        type: string | string[]
        required: conditional
        use: patch files applied in order as one bundle layer
        note: Required when dsh.bundle is set; a package without dsh.bundle installs as a plain dependency, not a profile layer.
      - name: dsh.bundle.platforms
        type: string[]
        required: false
        use: Node Host platform names the bundle supports; omission allows every OS; enforced before composing
      - name: dsh.bundle.listedByDefault
        type: boolean
        required: false
        use: show the bundle in GUI lists before the profile enables it; default true
      - name: dsh.profile.bundles
        type: string[]
        required: false
        use: ordered bundle layers of a profile directory
      - name: dsh.client.platform
        type: string
        required: conditional
        use: client platform id; the Web consumer selects web
        note: Required when dsh.client is set.
      - name: dsh.client.inject
        type: string[]
        required: false
        use: informational package-name dependencies
      - name: dsh.client.immediately
        type: boolean
        required: false
        use: boot phase-one registration barrier
      - name: dsh.client.external
        type: string[]
        required: false
        use: module-table requests beyond the client baseline
    note: Local profile readers accept a partial manifest, so name and version are not required there.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 DeepSeek Harness Plugin manifest fields](../../study-results/DeepSeek%20Harness/2026-11-05%20DeepSeek%20Harness%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[deepseek-ai deepseek-harness package-manifest types.ts at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20package-manifest%20types.ts%20at%20fcc0ad4.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - The README names internal configTrees, sessionFormatMigration and moduleFallback metadata that the public types leave out. Where do they live in package.json, and may a third-party package set them?
imported_from: fact:plugins/manifest-fields@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/plugins/manifest-fields.md`.

Open questions:
- The README names internal configTrees, sessionFormatMigration and moduleFallback metadata that the public types leave out. Where do they live in package.json, and may a third-party package set them?
