---
type: Harness Fact
title: "DeepSeek Harness (dsh): Marketplace fields"
description: "Marketplace fields in DeepSeek Harness (dsh), as observed over time."
tags: [plugins]
harness: dsh
subject: plugins/marketplace-fields
observations:
  - value: { applicable: false, note: "plugins install from npm registries through pnpm; the official on-demand catalog is generated inside the dsh repository from a fixed package list, not a file an author writes" }
    since: null
    until: null
    observed: "2026-11-05"
    source: dsh-catalog-source
    locator: "scripts/gen-official-bundle-catalog.ts:1-60; packages/boot/plugin-manager/src/registry.ts:1-20 at fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159"
    evidence: source
sources:
  - id: dsh-catalog-source
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/scripts/gen-official-bundle-catalog.ts"
    title: "deepseek-ai/deepseek-harness gen-official-bundle-catalog.ts at fcc0ad4"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md).

## Observations

- 2026-11-05: applicable: `false`. Plugins come from npm registries. The official catalog is
  generated from dsh's own packages, so there is no catalog file for an author to
  write.[^dsh-catalog-source]

  ```ts
  /** Embed package-owned display metadata for Official bundles whose providers install on demand. */
  ...
  const OUTPUT = 'packages/util/official-bundles/src/catalog.generated.ts'
  ...
      if (entry === undefined || !entry.path.startsWith('packages/') || !packageName.startsWith('@deepseek-ai/dsh-') || entry.private || !entry.bundle) {
        throw new Error(`${packageName}: Official catalog entries must be public DSH bundle packages`)
  ```

[^dsh-catalog-source]: deepseek-ai/deepseek-harness gen-official-bundle-catalog.ts at fcc0ad4
