# pr-common

Not an action. The scripts shared by [`claude-pr`](../claude-pr/),
[`codex-pr`](../codex-pr/) and [`cursor-pr`](../cursor-pr/), each of which keeps
only its install step and a `harness.sh` that runs its CLI once with one key.

| Script             | Does                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `mention.sh`       | Finds a real `@$AGENT` mention (not in code or quotes) and the mode: skill, review or answer.                          |
| `ask.sh`           | Builds the prompt and tries each key, moving on only when `harness_auth_failed` says so.                               |
| `post.sh`          | Posts the result with the done or failed marker.                                                                       |
| `skill-request.sh` | Parses `@$AGENT /plugin:skill args --apply` (sourced); validates the skill name.                                       |
| `apply.sh`         | `--apply`: `check` refuses a fork or default/base head; `patch` makes the artifact; `push` validates, commits, pushes. |
| `install-agent.sh` | Installs a CLI and plugins through [`agent-setup`](../agent-setup/).                                                   |
| `test.sh`          | Tests all of the above for the three agents against fake CLIs: `./test.sh`.                                            |

A `harness.sh` defines `harness_run`, `harness_auth_failed` and
`harness_review_intro`, and may set `HARNESS_OFFLINE=1` and define
`harness_prompt_suffix`; see the head of `ask.sh`.

## Skill mode

`@AGENT /<plugin>:<skill> [args] [--apply]` runs any skill. `ask.sh` builds a
"How you were called" block (one function, `how_called`, the same words for every
harness except the Limits line from `harness_limits`) and each harness places it
where its CLI can use it without changing how the skill is called:

| Harness | Prompt                                            | Block                                                                             |
| ------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| claude  | only `/<plugin>:<skill> <args>`                   | `--append-system-prompt` (lines after a slash command would become its arguments) |
| codex   | only `$<plugin>:<skill> <args>`                   | `-c developer_instructions=<json string>`                                         |
| cursor  | block, then the skill's `SKILL.md`, then the call | in the prompt (no system prompt flag)                                             |

A harness opts into the system-prompt placement by defining
`harness_uses_system_prompt` and reading `$SYSTEM_PROMPT` in `harness_run`. It
may also define `harness_skill_ref`, `harness_skill_invocation`, `harness_limits`,
`harness_skill_resolve` and `harness_skill_suffix`; see the head of `ask.sh`.
Answer and review prompts are unchanged and carry no such block.
`harness_run` also gets `$APPLY` (1 with `--apply`) to widen its permissions.
