---
type: Harness Fact
title: "Goose: Marketplace fields"
description: "Marketplace fields in Goose, as observed over time."
tags: [plugins]
harness: goose
subject: plugins/marketplace-fields
observations:
  - value: { applicable: false, note: "goose plugin install takes a git repository URL; the plugin commands are install and update, and the docs describe no catalog file" }
    since: null
    until: null
    observed: "2026-11-05"
    source: goose-cli-source
    locator: "crates/goose-cli/src/cli.rs:711-731 at 4facf56cbab049142809d9afa4648ebe6823ba80"
    evidence: source
sources:
  - id: goose-cli-source
    resource: "https://github.com/block/goose/blob/4facf56cbab049142809d9afa4648ebe6823ba80/crates/goose-cli/src/cli.rs"
    title: "block/goose cli.rs at 4facf56"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Goose](/harnesses/goose.md).

## Observations

- 2026-11-05: applicable: `false`. Plugins install from a git URL; there is no marketplace
  command and no catalog file.[^goose-cli-source]

  ```rust
  enum PluginCommand {
      /// Install a plugin from a git repository URL
      #[command(about = "Install a plugin from a git repository URL")]
      Install {
          ...
          #[arg(help = "URL to a git repository containing a supported plugin")]
          url: String,
      },
      /// Update an installed git-backed plugin
      ...
      Update {
  ```

[^goose-cli-source]: block/goose cli.rs at 4facf56
