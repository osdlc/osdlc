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
  exact: The emitted error subtypes are `error_max_turns`, `error_during_execution`, and `error_max_structured_output_retries`. The schema's `error_max_budget_usd` subtype is never emitted, because grok has no budget feature.
  prefix: "e is not known at message open. "
  suffix: " `result.usage` reports the Mess"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> The emitted error subtypes are `error_max_turns`, `error_during_execution`, and `error_max_structured_output_retries`. The schema's `error_max_budget_usd` subtype is never emitted, because grok has no budget feature.
