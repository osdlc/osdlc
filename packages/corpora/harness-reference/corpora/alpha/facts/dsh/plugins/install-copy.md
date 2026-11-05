---
type: Harness Fact
title: "DeepSeek Harness (dsh): Plugin install copy"
description: "Plugin install copy in DeepSeek Harness (dsh), as observed over time."
tags: [plugins]
harness: dsh
subject: plugins/install-copy
observations: []
open:
  - question: "Does pnpm install copy or hard-link a plugin package, and do exec bits and symlinks survive?"
    observed: "2026-11-04"
    source: dsh-plugin-manager
sources:
  - id: dsh-plugin-manager
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md"
    title: "dsh plugin-manager package README"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Open questions

- Does pnpm install copy or hard-link a plugin package, and do exec bits and symlinks survive?[^dsh-plugin-manager]

[^dsh-plugin-manager]: dsh plugin-manager package README
