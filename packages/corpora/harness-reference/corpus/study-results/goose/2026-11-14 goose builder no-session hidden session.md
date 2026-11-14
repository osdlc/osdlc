---
kind: source
reportedIn:
  - "[aaif-goose goose session builder.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20session%20builder.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/session/builder.rs#L455-L466 at 2365bc5e898a38133c373eef2d1357416acd66e2 (resolve_session_id)
excerpt:
  exact: 'if session_config.no_session { let working_dir = std::env::current_dir().unwrap_or_else(|e| { output::render_error(&format!("Could not get working directory: {}", e)); process::exit(1); }); let session = session_manager .create_session( working_dir, "CLI Session".to_string(), SessionType::Hidden, goose_mode, )'
  prefix: "_mode: GooseMode, ) -> String { "
  suffix: " .await .unwrap_or_else(|e| { ou"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if session_config.no_session { let working_dir = std::env::current_dir().unwrap_or_else(|e| { output::render_error(&format!("Could not get working directory: {}", e)); process::exit(1); }); let session = session_manager .create_session( working_dir, "CLI Session".to_string(), SessionType::Hidden, goose_mode, )
