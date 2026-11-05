---
type: Harness Fact
title: "DeepSeek Harness (dsh): Old plugin versions"
description: "Old plugin versions in DeepSeek Harness (dsh), as observed over time."
tags: [plugins]
harness: dsh
subject: plugins/upgrade-retention
observations:
  - value: {"old_version_kept": false, "mechanism": "update removes the installed version, then installs the exact newer version"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-plugin-manager
    locator: "packages/boot/plugin-manager/README.md:58 at fcc0ad46"
    evidence: source
    note: "Pnpm store retention is not discussed."
sources:
  - id: dsh-plugin-manager
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md"
    title: "dsh plugin-manager package README"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Observations

- 2026-11-04: old version kept: no; mechanism: update removes the installed version, then installs the exact newer version. Pnpm store retention is not discussed.[^dsh-plugin-manager]

  > With HMR the update removes the installed version, so its plugins stop, then installs `name@version`

[^dsh-plugin-manager]: dsh plugin-manager package README
