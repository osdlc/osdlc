---
kind: source
reportedIn:
  - "[aaif-goose goose session_manager.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20session_manager.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/session/session_manager.rs#L1867-L1871 at 2365bc5e898a38133c373eef2d1357416acd66e2 (create_session)
excerpt:
  exact: COALESCE(?, ? || '_' || CAST(COALESCE(( SELECT MAX(CAST(SUBSTR(id, 10) AS INTEGER)) FROM sessions WHERE id LIKE ? || '_%' ), 0) + 1 AS TEXT)),
  prefix: "sion_data, goose_mode) VALUES ( "
  suffix: " ?, FALSE, ?, ?, '{}', ? ) RETUR"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> COALESCE(?, ? || '_' || CAST(COALESCE(( SELECT MAX(CAST(SUBSTR(id, 10) AS INTEGER)) FROM sessions WHERE id LIKE ? || '_%' ), 0) + 1 AS TEXT)),
