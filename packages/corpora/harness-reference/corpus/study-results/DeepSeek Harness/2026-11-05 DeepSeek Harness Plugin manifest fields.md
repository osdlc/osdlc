---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness package-manifest types.ts at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20package-manifest%20types.ts%20at%20fcc0ad4.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
observed: 2026-11-05
locator: packages/util/package-manifest/src/types.ts:8-100 at fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@dsh#observation-1
---

Imported from `facts/dsh/plugins/manifest-fields.md`, observation 1.

- file: "package.json"
- fields: [{"name":"name","type":"string","required":true,"use":"published npm package name"},{"name":"version","type":"string","required":true,"use":"published npm package version"},{"name":"description","type":"string","required":false,"use":"package summary for discovery and display"},{"name":"icon","type":"string","required":false,"use":"plugin icon: an SVG, PNG, JPEG or WebP file inside the package, at most 256 KiB"},{"name":"private","type":"boolean","required":false,"use":"prevents npm publication, for example for local profiles"},{"name":"dependencies","type":"Record<string, string>","required":false,"use":"packages installed alongside"},{"name":"optionalDependencies","type":"Record<string, string>","required":false,"use":"packages that install or platform checks may skip"},{"name":"peerDependencies","type":"Record<string, string>","required":false,"use":"compatible versions supplied by the consuming project"},{"name":"engines.dsh","type":"string","required":false,"use":"compatible DSH versions as a SemVer range; not enforced"},{"name":"engines.node","type":"string","required":false,"use":"compatible Node.js versions"},{"name":"engines.npm","type":"string","required":false,"use":"compatible npm versions"},{"name":"dsh.manifestVersion","type":"1","required":false,"use":"manifest format version; not enforced"},{"name":"dsh.bundle.patch","type":"string | string[]","required":"conditional","use":"patch files applied in order as one bundle layer","note":"Required when dsh.bundle is set; a package without dsh.bundle installs as a plain dependency, not a profile layer."},{"name":"dsh.bundle.platforms","type":"string[]","required":false,"use":"Node Host platform names the bundle supports; omission allows every OS; enforced before composing"},{"name":"dsh.bundle.listedByDefault","type":"boolean","required":false,"use":"show the bundle in GUI lists before the profile enables it; default true"},{"name":"dsh.profile.bundles","type":"string[]","required":false,"use":"ordered bundle layers of a profile directory"},{"name":"dsh.client.platform","type":"string","required":"conditional","use":"client platform id; the Web consumer selects web","note":"Required when dsh.client is set."},{"name":"dsh.client.inject","type":"string[]","required":false,"use":"informational package-name dependencies"},{"name":"dsh.client.immediately","type":"boolean","required":false,"use":"boot phase-one registration barrier"},{"name":"dsh.client.external","type":"string[]","required":false,"use":"module-table requests beyond the client baseline"}]
- note: "Local profile readers accept a partial manifest, so name and version are not required there."
