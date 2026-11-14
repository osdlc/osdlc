---
methodType: probe
harnesses:
  - "[Claude Code](../../harnesses/Claude%20Code.md)"
subjects:
  - "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
  - "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
commands:
  claude-code:
    - claude --version
    - 'cd fixture && claude -p --model haiku --output-format json "$(printf "/echoargs alpha beta\nHow you were called\n- line two\n- line three")"'
    - 'cd fixture && claude -p --model haiku --output-format json "$(printf "Some context first.\n\n/echoargs alpha beta")"'
    - 'cd fixture && claude -p --model haiku --output-format json "/echoargs alpha beta" --append-system-prompt "How you were called: headless test run."'
    - 'cd fixture && claude -p --model haiku --output-format json "/runid" --append-system-prompt "How you were called: headless test run; the run id is ZEBRA-42."'
record:
  - The harness version.
  - "For each run, the reply text and `num_turns`."
  - "Whether the reply holds ARGS-START[...]ARGS-END, and exactly what is between the brackets (newlines included)."
  - Whether the model called the command itself through a tool when the call was not at the prompt start.
  - "Whether the `/runid` reply is RUNID=ZEBRA-42."
safety:
  - Uses the signed-in account and counts against its usage.
  - Runs only the fixture's two commands, which only reply with text.
---

# Slash command arguments in a headless prompt

The fixture holds two project commands in `fixture/.claude/commands/`. `echoargs` replies with its
`$ARGUMENTS` between markers. `runid` replies with a run id taken from the model's context.

The four runs after `claude --version` answer:

1. whether a call at the start of the prompt is parsed, and whether later lines become arguments;
2. whether a call after other text is parsed, or the model runs it itself (this depends on the
   model);
3. whether `--append-system-prompt` keeps the parsing;
4. whether the appended text reaches the model.
