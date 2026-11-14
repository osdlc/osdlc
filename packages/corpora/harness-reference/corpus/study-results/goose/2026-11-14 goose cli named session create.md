---
kind: source
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/cli.rs#L465-L468 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: let has_user_provided_name = id.name.is_some(); let name = id.name.unwrap_or_else(|| "CLI Session".to_string()); let session = session_manager .create_session(
  prefix: 'ssion-id without --resume")); } '
  suffix: " std::env::current_dir()?, name."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let has_user_provided_name = id.name.is_some(); let name = id.name.unwrap_or_else(|| "CLI Session".to_string()); let session = session_manager .create_session(
