---
kind: source
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-pager/src/app/cli.rs:416 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: pub struct PagerArgs {
  prefix: '{subcommands}{after-help}\ " )] '
  suffix: " /// Print version #[arg(short ="
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> pub struct PagerArgs {

The options of `PagerArgs` (lines 416 to 770 of the file at this commit) were read in full. None adds a directory to a run, passes an MCP config file, limits a run to given MCP servers, turns session saving off, or reads the system prompt from a file.
