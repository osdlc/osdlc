---
kind: source
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/cli.rs#L461-L463 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: if id.session_id.is_some() { return Err(anyhow::anyhow!("Cannot use --session-id without --resume")); }
  prefix: "return Ok(Some(session.id)); }; "
  suffix: " let has_user_provided_name = id"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if id.session_id.is_some() { return Err(anyhow::anyhow!("Cannot use --session-id without --resume")); }
