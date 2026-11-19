---
kind: source
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-agent/src/skills/discovery.rs#L30-L37 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: "struct Frontmatter { #[serde(default)] name: Option<String>, #[serde(default)] description: String, #[serde(default)] metadata: HashMap<String, Value>, }"
  prefix: "} #[derive(Debug, Deserialize)] "
  suffix: " fn parse_frontmatter<T: for<'de"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> struct Frontmatter { #[serde(default)] name: Option<String>, #[serde(default)] description: String, #[serde(default)] metadata: HashMap<String, Value>, }
