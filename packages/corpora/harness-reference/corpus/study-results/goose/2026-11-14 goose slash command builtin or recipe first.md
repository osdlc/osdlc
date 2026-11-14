---
kind: source
reportedIn:
  - "[aaif-goose goose skill_slash_command.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skill_slash_command.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/slash_commands/skill_slash_command.rs#L50-L52 at 2365bc5e898a38133c373eef2d1357416acd66e2 (resolve_command)
excerpt:
  exact: if is_builtin_command(command) || get_existing_recipe_for_command(command).is_some() { return Ok(None); }
  prefix: "esult<Option<String>, String> { "
  suffix: " let command_name = normalize_co"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if is_builtin_command(command) || get_existing_recipe_for_command(command).is_some() { return Ok(None); }
