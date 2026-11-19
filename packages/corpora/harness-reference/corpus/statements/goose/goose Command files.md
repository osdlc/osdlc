---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: commands/files
  object:
    supported: partial
    note: A custom slash command is a name mapped to a recipe file (YAML) under slash_commands in config.yaml; there is no commands folder. Skills are also callable as /<skill-name>.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose recipe slash command mapping](../../study-results/goose/2026-11-14%20goose%20recipe%20slash%20command%20mapping.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The config key slash_commands holds command and recipe_path pairs.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs custom slash commands run recipes](../../study-results/goose/2026-11-14%20goose%20docs%20custom%20slash%20commands%20run%20recipes.md)"
      - "[2026-11-14 goose docs slash commands in config file](../../study-results/goose/2026-11-14%20goose%20docs%20slash%20commands%20in%20config%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The slash commands guide says custom commands run recipes and are listed in the configuration file.
reportedIn:
  - "[aaif-goose goose recipe_slash_command.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20recipe_slash_command.rs%20at%202365bc5.md)"
  - "[aaif-goose goose slash-commands.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20slash-commands.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Command files](../../subjects/commands/Command%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Custom slash commands are not standalone command files. Each one maps a name to a recipe file in the config.
