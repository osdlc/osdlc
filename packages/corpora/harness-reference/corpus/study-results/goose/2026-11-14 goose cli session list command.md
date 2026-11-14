---
kind: source
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/cli.rs#L521-L529 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: '#[command(about = "List all available sessions")] List { #[arg( short, long, help = "Output format (text, json)", default_value = "text" )] format: String,'
  prefix: "command)] enum SessionCommand { "
  suffix: ' #[arg( long = "ascending", help'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> #[command(about = "List all available sessions")] List { #[arg( short, long, help = "Output format (text, json)", default_value = "text" )] format: String,
