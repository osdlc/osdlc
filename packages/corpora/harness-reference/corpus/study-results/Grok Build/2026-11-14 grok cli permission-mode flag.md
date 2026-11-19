---
kind: source
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-pager/src/app/cli.rs:673-677 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: long = "permission-mode", value_name = "MODE", value_parser = clap::builder::PossibleValuesParser::new( xai_grok_shell::agent::config::PermissionMode::VALID_VALUES )
  prefix: "2>, /// Permission mode. #[arg( "
  suffix: " )] pub permission_mode_flag: Op"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> long = "permission-mode", value_name = "MODE", value_parser = clap::builder::PossibleValuesParser::new( xai_grok_shell::agent::config::PermissionMode::VALID_VALUES )
