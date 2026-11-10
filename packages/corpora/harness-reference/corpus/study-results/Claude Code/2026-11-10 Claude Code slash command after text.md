---
kind: run
specifiedBy: "[Slash command arguments in a headless prompt](../../methods/Slash%20command%20arguments%20in%20a%20headless%20prompt/Slash%20command%20arguments%20in%20a%20headless%20prompt.md)"
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
version: 2.1.319
version_basis: exact
observed: 2026-11-10
locator: claude -p --model haiku with text, a blank line, then "/echoargs alpha beta"
ancillaryResults:
  parsed_as_command: false
  model_called_command: true
  num_turns: 3
qualityMeasures:
  model: haiku
  runs: 1
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-10T01:05:59Z
---

The prompt was a line of text, a blank line, then `/echoargs alpha beta`. Claude Code did not parse
it as a command. The model called the command itself through a tool, with the arguments
`alpha beta`. The run took 3 turns.

Ported from the alpha fact `facts/claude-code/cli/headless-slash-command.md`, observation 2, in
[#109](https://github.com/osdlc/skillwright/pull/109).
