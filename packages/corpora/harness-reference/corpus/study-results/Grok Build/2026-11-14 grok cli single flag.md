---
kind: source
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-pager/src/app/cli.rs:470-474 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: "/// Single-turn prompt. Prints the response to stdout and exits. #[clap( short = 'p', long = \"single\", alias = \"print\","
  prefix: ")] pub deny_rules: Vec<String>, "
  suffix: ' value_name = "PROMPT", conflict'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> /// Single-turn prompt. Prints the response to stdout and exits. #[clap( short = 'p', long = "single", alias = "print",
