---
kind: source
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/cli.rs#L711-L731 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: 'enum PluginCommand { /// Install a plugin from a git repository URL #[command(about = "Install a plugin from a git repository URL")] Install { #[arg( long, help = "Automatically update this plugin before plugin skills are loaded" )] auto_update: bool, #[arg(help = "URL to a git repository containing a supported plugin")] url: String, }, /// Update an installed git-backed plugin #[command(about = "Update an installed git-backed plugin")] Update { #[arg(help = "Name of the installed plugin to update")] name: String, }, }'
  prefix: "ing, }, } #[derive(Subcommand)] "
  suffix: " #[derive(Subcommand)] enum Skil"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> enum PluginCommand { /// Install a plugin from a git repository URL #[command(about = "Install a plugin from a git repository URL")] Install { #[arg( long, help = "Automatically update this plugin before plugin skills are loaded" )] auto_update: bool, #[arg(help = "URL to a git repository containing a supported plugin")] url: String, }, /// Update an installed git-backed plugin #[command(about = "Update an installed git-backed plugin")] Update { #[arg(help = "Name of the installed plugin to update")] name: String, }, }
