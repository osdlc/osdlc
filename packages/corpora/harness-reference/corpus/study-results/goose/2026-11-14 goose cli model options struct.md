---
kind: source
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/cli.rs#L335-L338 at 2365bc5e898a38133c373eef2d1357416acd66e2 (ModelOptions holds only provider and model)
excerpt:
  exact: "/// Model/provider override options #[derive(Args, Debug, Clone, Default)] pub struct ModelOptions { /// Provider to use for this run (overrides environment variable)"
  prefix: 'rmat: "text".to_string(), } } } '
  suffix: ' #[arg( long = "provider", value'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> /// Model/provider override options #[derive(Args, Debug, Clone, Default)] pub struct ModelOptions { /// Provider to use for this run (overrides environment variable)
