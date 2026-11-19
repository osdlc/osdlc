---
kind: source
reportedIn:
  - "[aaif-goose goose recipe_slash_command.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20recipe_slash_command.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/slash_commands/recipe_slash_command.rs#L15-L21 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: 'const SLASH_COMMANDS_CONFIG_KEY: &str = "slash_commands"; #[derive(Debug, Clone, Serialize, Deserialize)] pub struct SlashCommandMapping { pub command: String, pub recipe_path: String, }'
  prefix: "r, RecipeParameterRequirement}; "
  suffix: " pub fn list_commands() -> Vec<S"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const SLASH_COMMANDS_CONFIG_KEY: &str = "slash_commands"; #[derive(Debug, Clone, Serialize, Deserialize)] pub struct SlashCommandMapping { pub command: String, pub recipe_path: String, }
