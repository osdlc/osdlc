---
kind: run
specifiedBy: "[Slash command arguments in a headless prompt](../../methods/Slash%20command%20arguments%20in%20a%20headless%20prompt/Slash%20command%20arguments%20in%20a%20headless%20prompt.md)"
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
version: 2.1.319
version_basis: exact
observed: 2026-11-10
locator: claude -p --model haiku "/echoargs alpha beta" followed by three more lines
ancillaryResults:
  parsed_as_command: true
  num_turns: 1
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

The prompt was `/echoargs alpha beta` and then three more lines. It was parsed as the command.
`$ARGUMENTS` held the whole rest of the prompt, the later lines and their newlines included. The
run took 1 turn.

Ported from the alpha fact `facts/claude-code/cli/headless-slash-command.md`, observation 1, in
[#109](https://github.com/osdlc/skillwright/pull/109).
