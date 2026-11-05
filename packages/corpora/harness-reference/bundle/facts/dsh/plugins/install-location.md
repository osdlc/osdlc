---
type: Harness Fact
title: "DeepSeek Harness (dsh): Plugin install location"
description: "Plugin install location in DeepSeek Harness (dsh), as observed over time."
tags: [plugins]
harness: dsh
subject: plugins/install-location
observations:
  - value: {"format": "npm package installed through pnpm", "dev_install": "link: dependency on a workspace package directory"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-plugin-manager
    locator: "packages/boot/plugin-manager/README.md:52 at fcc0ad46"
    evidence: source
open:
  - question: "Which folder holds an installed plugin package, and where is it relative to the profile directory?"
    observed: "2026-11-04"
    source: dsh-plugin-manager
sources:
  - id: dsh-plugin-manager
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md"
    title: "dsh plugin-manager package README"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: format: npm package installed through pnpm; dev install: link: dependency on a workspace package directory.[^dsh-plugin-manager]

  > Source Web and development Desktop offer `link:<absolute workspace package directory>` from the running CLI installation

## Open questions

- Which folder holds an installed plugin package, and where is it relative to the profile directory?[^dsh-plugin-manager]

[^dsh-plugin-manager]: dsh plugin-manager package README
