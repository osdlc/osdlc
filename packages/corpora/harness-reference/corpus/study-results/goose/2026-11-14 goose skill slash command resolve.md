---
kind: source
reportedIn:
  - "[aaif-goose goose skill_slash_command.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skill_slash_command.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/slash_commands/skill_slash_command.rs#L53-L61 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: let command_name = normalize_command_name(command); let Some(skill) = crate::skills::list_installed_skills(working_dir) .into_iter() .find(|skill| normalize_command_name(&skill.name) == command_name) else { return Ok(None); }; let args = (!params_str.is_empty()).then_some(params_str);
  prefix: ".is_some() { return Ok(None); } "
  suffix: " let prompt = crate::skills::loa"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let command_name = normalize_command_name(command); let Some(skill) = crate::skills::list_installed_skills(working_dir) .into_iter() .find(|skill| normalize_command_name(&skill.name) == command_name) else { return Ok(None); }; let args = (!params_str.is_empty()).then_some(params_str);
