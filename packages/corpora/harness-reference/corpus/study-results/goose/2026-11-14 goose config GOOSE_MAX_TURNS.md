---
kind: source
reportedIn:
  - "[aaif-goose goose config base.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20config%20base.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/config/base.rs#L1359 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: self.get_param::<u32>("GOOSE_MAX_TURNS").unwrap_or(1000)
  prefix: "fault_max_turns(&self) -> u32 { "
  suffix: " } pub fn get_goose_context_limi"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> self.get_param::<u32>("GOOSE_MAX_TURNS").unwrap_or(1000)
