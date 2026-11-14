---
kind: source
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/cli.rs#L419-L425 at 2365bc5e898a38133c373eef2d1357416acd66e2 (get_or_create_session_id)
excerpt:
  exact: let sessions = session_manager .list_sessions_by_types(&[SessionType::User]) .await?; let session_id = sessions .first() .map(|s| s.id.clone()) .ok_or_else(|| anyhow::anyhow!("No session found to resume"))?;
  prefix: "et Some(id) = identifier else { "
  suffix: " return Ok(Some(session_id)); };"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let sessions = session_manager .list_sessions_by_types(&[SessionType::User]) .await?; let session_id = sessions .first() .map(|s| s.id.clone()) .ok_or_else(|| anyhow::anyhow!("No session found to resume"))?;
