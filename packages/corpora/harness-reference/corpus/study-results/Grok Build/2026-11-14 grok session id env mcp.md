---
kind: source
reportedIn:
  - "[xai-org grok-build mcp servers.rs](../../documents/github.com/xai-org%20grok-build%20mcp%20servers.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-mcp/src/servers.rs:4776 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: cmd.env("GROK_SESSION_ID", session_id);
  prefix: "Some(session_id) = session_id { "
  suffix: " } } /// Borrowed cross-cutting "
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> cmd.env("GROK_SESSION_ID", session_id);
