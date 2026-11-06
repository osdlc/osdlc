---
type: Harness Fact
title: "Goose: Plugin root variable"
description: "Plugin root variable in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/plugin-root-variable
observations:
  - value: {"variable": "${PLUGIN_ROOT}", "substituted_in": ["hooks.json command"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-plugins
    locator: "Add a Hook to a Plugin"
    evidence: docs
open:
  - question: "Is ${PLUGIN_ROOT} substituted in a skill body?"
    observed: "2026-11-04"
    source: goose-skills
sources:
  - id: goose-plugins
    resource: "https://goose-docs.ai/docs/guides/context-engineering/plugins"
    title: "goose docs: Plugins"
  - id: goose-skills
    resource: "https://goose-docs.ai/docs/guides/context-engineering/using-skills"
    title: "goose docs: Skills"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Goose](/harnesses/goose.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variable: ${PLUGIN_ROOT}; substituted in: hooks.json command.[^goose-plugins]

  > Use `${PLUGIN_ROOT}` to reference files inside the plugin directory.

## Open questions

- Is ${PLUGIN_ROOT} substituted in a skill body?[^goose-skills]

[^goose-plugins]: goose docs: Plugins
[^goose-skills]: goose docs: Skills
