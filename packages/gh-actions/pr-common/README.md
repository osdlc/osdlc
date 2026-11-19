# pr-common

Not an action. The scripts shared by [`claude-pr`](../claude-pr/),
[`codex-pr`](../codex-pr/) and [`cursor-pr`](../cursor-pr/), each of which keeps
only its install step and a `harness.sh` that runs its CLI once with one key.

| Script             | Does                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `mention.sh`       | Finds a real `@$AGENT` mention (not in code or quotes) and the mode, review or answer.                                       |
| `ask.sh`           | Builds the prompt and tries each key in order, moving on only when `harness_auth_failed` or `harness_key_exhausted` says so. |
| `post.sh`          | Posts the result with the done or failed marker.                                                                             |
| `install-agent.sh` | Installs a CLI and plugins through [`agent-setup`](../agent-setup/).                                                         |
| `test.sh`          | Tests all of the above for the three agents against fake CLIs: `./test.sh`.                                                  |

A `harness.sh` defines `harness_run`, `harness_auth_failed`,
`harness_key_exhausted` and `harness_review_intro`, and may set `HARNESS_OFFLINE=1` and define
`harness_prompt_suffix`; see the head of `ask.sh`.
