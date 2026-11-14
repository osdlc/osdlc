---
kind: source
reportedIn:
  - "[aaif-goose goose cli session mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli%20session%20mod.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/session/mod.rs#L2292-L2296 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: 'fn emit_stream_event(event: &StreamEvent) { if let Ok(json) = serde_json::to_string(event) { println!("{}", json); } }'
  prefix: "me(Color::Yellow), true, ); } } "
  suffix: " /// Prompt user for tool call c"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> fn emit_stream_event(event: &StreamEvent) { if let Ok(json) = serde_json::to_string(event) { println!("{}", json); } }
