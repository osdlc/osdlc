---
kind: docs
reportedIn:
  - "[Agent Plugins Specification](../../documents/agent-plugins.org/Agent%20Plugins%20Specification.md)"
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
observed: 2026-11-04
locator: Variables
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/plugin-root-variable@agent-plugins#observation-1
---

Imported from `facts/agent-plugins/skills/plugin-root-variable.md`, observation 1.

- variables: ["PLUGIN_ROOT","PLUGIN_DATA"]
- plugin_root: "absolute path of the filesystem-resolved plugin root"
- substituted_in: "MCP stdio args, env values and cwd"
- not_in: "env keys, command, fixed component locations, http url"

Read through a fetch tool that summarises, so the quoted wording may be paraphrased.
