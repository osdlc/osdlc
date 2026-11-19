---
kind: source
reportedIn:
  - "[aaif-goose goose session builder.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20session%20builder.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/session/builder.rs#L643 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: .system_prompt_override(Some(override_prompt))
  prefix: "ion_manager .update(session_id) "
  suffix: " .apply() .await?; } Ok(()) } pu"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> .system_prompt_override(Some(override_prompt))
