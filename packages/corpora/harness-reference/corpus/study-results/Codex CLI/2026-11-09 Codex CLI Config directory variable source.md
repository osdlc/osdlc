---
kind: source
reportedIn:
  - "[openai codex utils home-dir src lib.rs at c138238](../../documents/github.com/openai%20codex%20utils%20home-dir%20src%20lib.rs%20at%20c138238.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.162.0
version_basis: exact
observed: 2026-11-09
locator: codex-rs/utils/home-dir/src/lib.rs#L5-L8 at c1382380de69521303b416720a52f42d51af6248
excerpt:
  exact: Returns the path to the Codex configuration directory, which can be specified by the `CODEX_HOME` environment variable. If not set, defaults to `~/.codex`.
  prefix: "me_dir; use std::path::PathBuf; "
  suffix: " - If `CODEX_HOME` is set, the v"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
---
