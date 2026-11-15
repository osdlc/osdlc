---
kind: source
reportedIn:
  - "[openai codex login src auth manager.rs at c138238](../../documents/github.com/openai%20codex%20login%20src%20auth%20manager.rs%20at%20c138238.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.162.0
version_basis: exact
observed: 2026-11-09
locator: codex-rs/login/src/auth/manager.rs#L953-L954 at c1382380de69521303b416720a52f42d51af6248
excerpt:
  exact: 'pub const OPENAI_API_KEY_ENV_VAR: &str = "OPENAI_API_KEY"; pub const CODEX_API_KEY_ENV_VAR: &str = "CODEX_API_KEY";'
  prefix: "; *guard = Some(auth); Ok(()) } "
  suffix: " pub const CODEX_ACCESS_TOKEN_EN"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
---
