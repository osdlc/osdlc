---
kind: source
reportedIn:
  - "[aaif-goose goose thinking.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20thinking.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-provider-types/src/thinking.rs#L319-L323 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: '"off" | "disabled" | "none" => Ok(Self::Off), "low" => Ok(Self::Low), "medium" | "med" => Ok(Self::Medium), "high" => Ok(Self::High), "max" | "xhigh" => Ok(Self::Max),'
  prefix: "tch s.to_lowercase().as_str() { "
  suffix: ' other => Err(format!("unknown t'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> "off" | "disabled" | "none" => Ok(Self::Off), "low" => Ok(Self::Low), "medium" | "med" => Ok(Self::Medium), "high" => Ok(Self::High), "max" | "xhigh" => Ok(Self::Max),
