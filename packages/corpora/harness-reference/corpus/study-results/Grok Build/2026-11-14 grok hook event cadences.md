---
kind: docs
reportedIn:
  - "[Grok Build user guide Hooks](../../documents/github.com/Grok%20Build%20user%20guide%20Hooks.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: Hook Events
excerpt:
  exact: "Events fire at three cadences: once per session (`SessionStart`, `SessionEnd`), once per turn (`UserPromptSubmit`, `Stop`, `StopFailure`), and on every tool call inside the turn (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`)."
  prefix: "es together. --- ## Hook Events "
  suffix: " | Event | When it fires | Block"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> Events fire at three cadences: once per session (`SessionStart`, `SessionEnd`), once per turn (`UserPromptSubmit`, `Stop`, `StopFailure`), and on every tool call inside the turn (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`).
