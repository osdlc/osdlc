---
type: Harness Fact
title: "Grok Build: Plugin root variable"
description: "Plugin root variable in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/plugin-root-variable
observations:
  - value: {"variable": "GROK_PLUGIN_ROOT", "aliases": ["CLAUDE_PLUGIN_ROOT"], "substituted_in": ["plugin hook environment"], "data_variable": "GROK_PLUGIN_DATA"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-plugins
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md:438 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
open:
  - question: "Is GROK_PLUGIN_ROOT or CLAUDE_PLUGIN_ROOT substituted in a SKILL.md body or in .mcp.json?"
    observed: "2026-11-04"
    source: grok-build-plugins
sources:
  - id: grok-build-plugins
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md"
    title: "Grok Build user guide: Plugins"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Grok Build](/harnesses/grok-build.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variable: GROK_PLUGIN_ROOT; aliases: CLAUDE_PLUGIN_ROOT; substituted in: plugin hook environment; data variable: GROK_PLUGIN_DATA.[^grok-build-plugins]

  > Grok sets these and overrides any same-named value in the hook's `env` map (the `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` aliases are set too).

## Open questions

- Is GROK_PLUGIN_ROOT or CLAUDE_PLUGIN_ROOT substituted in a SKILL.md body or in .mcp.json?[^grok-build-plugins]

[^grok-build-plugins]: Grok Build user guide: Plugins
