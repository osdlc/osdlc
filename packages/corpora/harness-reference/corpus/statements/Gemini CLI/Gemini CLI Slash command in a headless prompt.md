---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: prompt start only
    arguments: the words after the command name, joined with single spaces
    later_text: becomes arguments, not context
    not_at_start: not parsed; the prompt goes to the model as written
    commands: built-in commands, MCP prompts and custom command files; skill commands are not loaded
    note: a command whose result is not a prompt ends the run with an input error; an unknown command goes to the model as written
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI headless slash command position source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20headless%20slash%20command%20position%20source.md)"
      - "[2026-11-14 Gemini CLI headless slash command loaders source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20headless%20slash%20command%20loaders%20source.md)"
      - "[2026-11-14 Gemini CLI slash command arguments source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20slash%20command%20arguments%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the prompt must start with a slash, three loaders supply the commands, and the remaining words become the arguments."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI headless slash command unsupported result source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20headless%20slash%20command%20unsupported%20result%20source.md)"
      - "[2026-11-14 Gemini CLI headless prompt fallthrough source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20headless%20prompt%20fallthrough%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: what happens to a command with no prompt result, and to input that matches no command."
reportedIn:
  - "[google-gemini gemini-cli cli src nonInteractiveCliCommands.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20nonInteractiveCliCommands.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src utils commands.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20utils%20commands.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src nonInteractiveCli.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20nonInteractiveCli.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

In a headless run the prompt is checked for a leading slash. The command list comes from the built-in, MCP prompt and file loaders; the skill loader used by the interactive UI is not among them, so `/skill-name` is not a command there. What the model does with an unparsed call was not tested.
