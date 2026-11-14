---
kind: source
reportedIn:
  - "[xai-org grok-build plugins manifest.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20manifest.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-agent/src/plugins/manifest.rs:262-264 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: '"plugin.json", ".grok-plugin/plugin.json", ".claude-plugin/plugin.json",'
  prefix: "st MANIFEST_PATHS: &[&str] = &[ "
  suffix: " ]; #[derive(Debug)] pub enum Ma"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> "plugin.json", ".grok-plugin/plugin.json", ".claude-plugin/plugin.json",
