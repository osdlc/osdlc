---
kind: source
reportedIn:
  - "[aaif-goose goose load_hints.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20load_hints.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/hints/load_hints.rs#L17-L23 at 2365bc5e898a38133c373eef2d1357416acd66e2 (get_context_filenames)
excerpt:
  exact: .get_param::<Vec<String>>("CONTEXT_FILE_NAMES") .unwrap_or_else(|_| { vec![ GOOSE_HINTS_FILENAME.to_string(), AGENTS_MD_FILENAME.to_string(), ] })
  prefix: "onfig::Config; Config::global() "
  suffix: " } #[derive(Default)] pub struct"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> .get_param::<Vec<String>>("CONTEXT_FILE_NAMES") .unwrap_or_else(|_| { vec![ GOOSE_HINTS_FILENAME.to_string(), AGENTS_MD_FILENAME.to_string(), ] })
