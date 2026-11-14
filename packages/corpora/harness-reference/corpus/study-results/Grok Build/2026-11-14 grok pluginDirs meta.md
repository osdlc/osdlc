---
kind: docs
reportedIn:
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: Where Grok looks for plugins
excerpt:
  exact: The `_meta.pluginDirs` field on the `session/new` and `session/load` requests loads plugins for a single session; because the caller supplies the directory, those plugins are trusted automatically and do not persist after the session.
  prefix: "you add | Depends on location | "
  suffix: " `--plugin-dir` is the process-w"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> The `_meta.pluginDirs` field on the `session/new` and `session/load` requests loads plugins for a single session; because the caller supplies the directory, those plugins are trusted automatically and do not persist after the session.
