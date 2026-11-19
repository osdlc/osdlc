---
kind: source
reportedIn:
  - "[dsh tool-skill package README](../../documents/github.com/dsh%20tool-skill%20package%20README.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
observed: 2026-11-04
locator: packages/skill/tool-skill/README.md:55 at fcc0ad46
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/agent-loading@dsh#observation-2
---

Imported from `facts/dsh/skills/agent-loading.md`, observation 2.

- mechanism: "skill tool"
- loads: "on demand: the model calls skill with the exact name; a /name token in user input injects the body without a tool call"
