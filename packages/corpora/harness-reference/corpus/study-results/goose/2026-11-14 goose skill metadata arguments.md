---
kind: source
reportedIn:
  - "[aaif-goose goose goose-agent skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20mod.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-agent/src/skills/mod.rs#L17-L20 at 2365bc5e898a38133c373eef2d1357416acd66e2 (skill_argument_names)
excerpt:
  exact: skill .properties .get("arguments") .and_then(|value| value.as_array())
  prefix: " &SourceEntry) -> Vec<String> { "
  suffix: " .map(|items| { items .iter() .f"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> skill .properties .get("arguments") .and_then(|value| value.as_array())
