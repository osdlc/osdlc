---
kind: docs
reportedIn:
  - "[Grok Build user guide Permissions and safety](../../documents/github.com/Grok%20Build%20user%20guide%20Permissions%20and%20safety.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: Evaluation Order
excerpt:
  exact: "Rules from every source are merged into one set and evaluated by severity, not order: any matching `deny` rejects, otherwise any matching `ask` prompts, otherwise any matching `allow` approves."
  prefix: " the load. ### Evaluation Order "
  suffix: " When no rule matches, the reque"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> Rules from every source are merged into one set and evaluated by severity, not order: any matching `deny` rejects, otherwise any matching `ask` prompts, otherwise any matching `allow` approves.
