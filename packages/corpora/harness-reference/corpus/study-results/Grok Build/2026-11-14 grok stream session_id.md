---
kind: docs
reportedIn:
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: streaming-messages-json
excerpt:
  exact: The `assistant` and `user` messages carry `session_id`, `uuid`, and `parent_tool_use_id` (`null` for the main conversation).
  prefix: "stop reason, and spend fields | "
  suffix: " The `system`/`init` and termina"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> The `assistant` and `user` messages carry `session_id`, `uuid`, and `parent_tool_use_id` (`null` for the main conversation).
