---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: the whole prompt, trimmed, must start with /
    arguments: all text after the first space, trimmed
    later_text: becomes arguments, not context
    not_at_start: not parsed; the prompt goes to the model as text
    note: The parser runs in the agent, on the first message of a turn, so it also covers goose run. It handles the agent commands, recipe commands from slash_commands in the config, and skills as /<skill-name>. CLI-only commands such as /mode are not handled there. GOOSE_SLASH_COMMANDS_ENABLED=false turns it off.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose slash command trims message](../../study-results/goose/2026-11-14%20goose%20slash%20command%20trims%20message.md)"
      - "[2026-11-14 goose slash command parse](../../study-results/goose/2026-11-14%20goose%20slash%20command%20parse.md)"
      - "[2026-11-14 goose slash command first message only](../../study-results/goose/2026-11-14%20goose%20slash%20command%20first%20message%20only.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The slash command operation trims the message, needs a leading slash and splits at the first space.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli headless sends prompt as user message](../../study-results/goose/2026-11-14%20goose%20cli%20headless%20sends%20prompt%20as%20user%20message.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The headless path sends the prompt as one user message to the agent.
  - hasEvidenceItems:
      - "[2026-11-14 goose skill slash command resolve](../../study-results/goose/2026-11-14%20goose%20skill%20slash%20command%20resolve.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: A command that is not built in or a recipe is looked up among the skills, and the rest of the text becomes its arguments.
  - hasEvidenceItems:
      - "[2026-11-14 goose slash commands enabled param](../../study-results/goose/2026-11-14%20goose%20slash%20commands%20enabled%20param.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The config parameter GOOSE_SLASH_COMMANDS_ENABLED switches the parser, on by default.
reportedIn:
  - "[aaif-goose goose ops_slash_command.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20ops_slash_command.rs%20at%202365bc5.md)"
  - "[aaif-goose goose cli session mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli%20session%20mod.rs%20at%202365bc5.md)"
  - "[aaif-goose goose skill_slash_command.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skill_slash_command.rs%20at%202365bc5.md)"
  - "[aaif-goose goose execute_commands.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20execute_commands.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Not confirmed by a headless run.
---

The agent parses a slash command when the trimmed prompt starts with `/`. The command name ends at the first space; the rest is the argument string. This is read from the source and not confirmed by a run.
