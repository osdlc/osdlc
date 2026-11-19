---
kind: source
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-pager/src/app/cli.rs:444-449 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: '/// Auto-approve all tool executions. #[clap( long = "always-approve", alias = "yolo", alias = "dangerously-skip-permissions" )]'
  prefix: "ub debug_file: Option<PathBuf>, "
  suffix: " pub yolo: bool, /// Trust this "
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> /// Auto-approve all tool executions. #[clap( long = "always-approve", alias = "yolo", alias = "dangerously-skip-permissions" )]
