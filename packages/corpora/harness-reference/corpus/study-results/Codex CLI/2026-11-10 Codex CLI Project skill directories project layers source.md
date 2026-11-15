---
kind: source
reportedIn:
  - "[openai codex config src loader mod.rs at 086ccc8](../../documents/github.com/openai%20codex%20config%20src%20loader%20mod.rs%20at%20086ccc8.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.0
version_basis: exact
observed: 2026-11-10
locator: codex-rs/config/src/loader/mod.rs#L1862-L1878 at 086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a (discover_project_layers, over the directories from the project root down to the working directory)
excerpt:
  exact: for dir in dirs { let dot_codex_abs = dir.join(".codex");
  prefix: " startup_warnings = Vec::new(); "
  suffix: " let dot_codex_uri = PathUri::fr"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-10T00:00:00Z
---

> for dir in dirs { let dot_codex_abs = dir.join(".codex");
