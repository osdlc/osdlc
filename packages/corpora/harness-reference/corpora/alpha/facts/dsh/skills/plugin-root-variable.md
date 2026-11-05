---
type: Harness Fact
title: "DeepSeek Harness (dsh): Plugin root variable"
description: "Plugin root variable in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/plugin-root-variable
observations: []
open:
  - question: "Does a dsh plugin or skill have a variable naming its own folder, and where is it substituted? The harness notes mention a pluginRoot row that sets CLAUDE_PLUGIN_ROOT, but the package READMEs read here do not."
    observed: "2026-11-04"
    source: dsh-plugin-manager
sources:
  - id: dsh-plugin-manager
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md"
    title: "dsh plugin-manager package README"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Open questions

- Does a dsh plugin or skill have a variable naming its own folder, and where is it substituted? The harness notes mention a pluginRoot row that sets CLAUDE_PLUGIN_ROOT, but the package READMEs read here do not.[^dsh-plugin-manager]

[^dsh-plugin-manager]: dsh plugin-manager package README
