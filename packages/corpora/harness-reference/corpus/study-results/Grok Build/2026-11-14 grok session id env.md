---
kind: source
reportedIn:
  - "[xai-org grok-build agent_rebuild.rs](../../documents/github.com/xai-org%20grok-build%20agent_rebuild.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-shell/src/session/agent_rebuild.rs:299 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: env.insert("GROK_SESSION_ID".to_string(), session_id_str.clone());
  prefix: "= session_env.as_ref().clone(); "
  suffix: " Arc::new(env) }; let presentati"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> env.insert("GROK_SESSION_ID".to_string(), session_id_str.clone());
