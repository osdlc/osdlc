---
kind: source
reportedIn:
  - "[openai codex core-plugins src command_migration.rs at ce21072](../../documents/github.com/openai%20codex%20core-plugins%20src%20command_migration.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/core-plugins/src/command_migration.rs#L418-L420 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (has_unsupported_command_template_features)
excerpt:
  exact: 'fn has_unsupported_command_template_features(template: &str) -> bool { template.contains("$ARGUMENTS") || contains_numbered_argument_placeholder(template)'
  prefix: "ription, rewrite_profile)), ) } "
  suffix: ' || (template.contains("{{") && '
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> fn has_unsupported_command_template_features(template: &str) -> bool { template.contains("$ARGUMENTS") || contains_numbered_argument_placeholder(template)
