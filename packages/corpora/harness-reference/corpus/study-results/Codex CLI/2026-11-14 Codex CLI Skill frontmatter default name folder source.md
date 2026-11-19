---
kind: source
reportedIn:
  - "[openai codex ext skills src loader host.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20loader%20host.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/ext/skills/src/loader/host.rs#L396-L400 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (default_skill_name)
excerpt:
  exact: "fn default_skill_name(path: &AbsolutePathBuf) -> String { path.parent() .and_then(|parent| { parent .file_name()"
  prefix: "remote_plugin_id.clone()), }) } "
  suffix: " .and_then(|name| name.to_str())"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> fn default_skill_name(path: &AbsolutePathBuf) -> String { path.parent() .and_then(|parent| { parent .file_name()
