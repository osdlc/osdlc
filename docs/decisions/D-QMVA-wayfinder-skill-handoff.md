# D-QMVA: wayfinder hands a skill to an agent CLI only when asked

Accepted 2026-11-05. Follows [#435](https://github.com/osdlc/osdlc/issues/435);
decides [#623](https://github.com/osdlc/osdlc/issues/623).

## Decision

- **Copy stays the default.** Run, Enter and `^y` on a skill copy
  `/<name>`, and plain `way run /<name>` still refuses with what to do
  instead. Starting an agent is a separate, explicit action:
  `way run /<name> --agent` (or `--harness <id>`) on the command line and
  `^g` in the terminal UI.
- **Both the CLI and the terminal UI, not the web view.** Both already hand
  their terminal to a task, and an agent session is interactive, so it needs
  that terminal. The web view keeps copying.
- **Which agent.** wayfinder starts three: Claude Code (`claude`), Codex
  (`codex`) and Cursor (`cursor-agent`), the harnesses
  `@osdlc/detect-harness` reads skills for. Of those that read the skill,
  the first whose binary is on `PATH` is started, in that order (the order
  detect-harness reports them in). `--harness` picks another. The terminal
  UI always takes the first and shows which, beside the skill.
- **The prompt.** The CLI gets one argument: the skill as that agent names
  it (`/<name>` for Claude Code and Cursor, `$<name>` for Codex), then the
  arguments. The skill's `argument-hint` is never sent. It is the prompt for
  the arguments: the terminal UI asks for them on its entry line before it
  starts the agent, and `run` notes the hint when none are given after
  `--`. Arguments are prompt text, so the words after `--` are joined by
  spaces, not passed as argv.
- **The agent starts in the repository root**, spawned without a shell, with
  no added variables, from an absolute `PATH` entry only. A skill name or
  arguments that hold a control character start nothing.

## Why

An agent session is heavier than a task: it takes over the terminal, can
change files and spend tokens, and runs until the person ends it. Copy keeps
the common case (paste into the agent already open) one key, and an explicit
flag or key keeps a slip of Enter from starting one.

A fixed order needs no setting and gives the same answer every time. It is
detect-harness's report order, so the skill's `harnesses` list and the
agent started agree, and it puts first the harness whose first-prompt form
(`claude "/review 123"`) the issue names. `--harness` covers the case the
order gets wrong from the shell.

Asking for the arguments before starting, rather than starting with
`/<name>` alone, sends the skill what it needs in its first turn.

## Options rejected

- **Hand-off as the default action**, with copy on another key: it starts a
  session where a person may only have wanted the text.
- **A `skills.agent` setting** for the preferred agent: one more setting for
  a choice the flag already makes. Add it if the terminal UI's fixed order
  proves wrong in practice.
- **Asking which agent each time** when several are installed: an extra
  step on every hand-off for a choice that rarely changes.
- **The hand-off from the web view:** the page's server would have to stop
  and give its terminal to the agent, which a person looking at a browser
  does not expect.
- **Running the skill headless** (`claude -p`): output would scroll past
  with no way to answer the agent's questions.

## Consequences

- The `run` document is reused for a hand-off: `task` is the skill's id,
  `display` its `/<name> [hint]` line, and `argv` starts with the CLI's
  absolute path. No new document kind.
- The Codex (`$<name>`) and Cursor (`/<name>`) prompt forms follow those
  tools' documentation; only the argv shape is tested here, with fake CLIs.

## Reopen if

An agent changes how a skill is named in a prompt, or stops taking a first
prompt as its argument; a fourth harness gets skills in detect-harness; or
people ask to pick the agent in the terminal UI.
