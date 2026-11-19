---
kind: source
reportedIn:
  - "[aaif-goose goose open_plugins.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20open_plugins.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/plugins/formats/open_plugins.rs#L21 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: 'const COMPONENT_MARKERS: &[&str] = &["hooks/hooks.json", "commands", "agents", ".mcp.json"];'
  prefix: ' FORMAT: &str = "open-plugins"; '
  suffix: " #[derive(Debug, Deserialize)] p"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const COMPONENT_MARKERS: &[&str] = &["hooks/hooks.json", "commands", "agents", ".mcp.json"];
