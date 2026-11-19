# claude-pr

Answers `@claude` on a pull request with Claude Code, or reviews the pull
request when the comment starts with `@claude review`.

- **Answer:** any comment, inline review comment or review that mentions
  `@claude` gets Claude's answer as a pull request comment.
- **Review:** `@claude review [focus]` at the start of a comment runs the craft
  plugin's `/craft:code-review` against the pull request's base branch. Text
  after `review` (more lines too) is the focus. The comment opens with
  **Claude review done** and the commit it covered.
- **Skill:** `@claude /<plugin>:<skill> [args]` runs any installed skill, read-only, or
  with `--apply` commits and pushes its edits; see [Skill mode](#skill-mode).
- **Instruction:** `@claude <free text> --apply` (not a `/skill`) carries out the text as a
  free-form instruction, with edits allowed; see [Free-form instruction](#free-form-instruction).
- **Marker:** every comment ends with `<!-- claude-review: done head=<sha> -->`
  (or `failed`; answers use `claude-answer`), so people and scripts can tell
  the run finished.
- **Only real mentions:** `@claude` inside code blocks, inline code or quoted
  lines is ignored, and the job stops before installing anything.
- **Read-only:** Claude may read files, run read-only `git` and `gh pr`
  commands, use skills and sub-agents, and run `node` for the craft scripts.
  It cannot edit, commit, push or comment; the action posts its final message.
- **Errors are posted:** if checkout, install or Claude fails, the comment says
  so and links the run log.

## Skill mode

`@claude /<plugin>:<skill> [args...]` as the first line runs any installed skill
(no allowlist; a bare `/<skill>` works too) and posts its output as a comment.
The other lines of the comment are extra instructions. The skill name must match
`^/?[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?$`, else the run is refused. Comment text
reaches the scripts only through environment variables and is passed to the
agent as text, never evaluated.

```
@claude /craft:simplify
@claude /craft:simplify src/ --apply
@claude /craft:simplify focus on the tests
please keep behaviour identical
```

- **Read-only by default.** The skill runs, and its findings or proposed diff
  come back as a comment. The agent cannot edit, commit, push or comment.
- **`--apply`** (a word in the first line's args; it is removed before the args
  reach the skill) lets the agent edit files: `--allowedTools` gains `Edit,Write,MultiEdit`; `--disallowedTools` keeps `NotebookEdit`, `Bash(git commit:*)`, `Bash(git push:*)` and `Bash(gh pr comment:*)`. Afterwards the agent job makes a patch
  (`git diff --binary`) of the working tree and uploads it as the
  `claude-pr-apply` artifact. A **second job**, which
  never runs the agent, checks the patch and pushes it with a GitHub App token
  (see [`pr-apply`](../pr-apply/)). That job posts the one comment: the agent's
  output, the diffstat and commit sha, or why nothing was pushed. If the agent
  changed nothing, the agent job posts its output and says so. On a failed agent
  run the agent job posts the failure.
- **Invocation.** The comment's first line becomes the prompt, `/craft:simplify <args>`, which `claude -p` runs as a slash command. The "How you were called" block (below) goes in `--append-system-prompt`, because claude would pass every later prompt line to the skill as its arguments.
- **How you were called.** One block, the same words for every harness: the
  harness, repo, PR number and title, base and head sha, headless (no human to
  ask), the exact skill and args, the rest of the comment as fenced data, read-only or
  apply, where the diff is, the limits and how the final message is used.
- **Markers.** `<!-- claude-run: done|failed head=<sha> -->`; the first line is
  **Claude ran /<skill>** for `<sha7>` (and ` and pushed <sha7>` after `--apply`
  pushed). A skill the CLI does not know (Claude's "unknown command" reply) posts a failed marker with the reason.

### `--apply` safety rules

The agent job has no environment, no push token and no App key. The push job
(action [`pr-apply`](../pr-apply/), full rules there) uses a fresh checkout and
only `git` and `gh`: it refuses a fork, a head that is the repository's default
or the PR's base branch, a head that moved since the agent ran, and patches that
touch `.github/`, `.git*`, paths outside the repository, symlinks, submodules or
add an executable bit. It pushes only `HEAD:refs/heads/<PR head branch>`,
never forced. The repository's own rules also protect main (PRs required, no
force-push). If the App's client ID or private key is missing, the push job
posts the agent's output and says nothing was pushed.

## Use the workflow

[`.github/workflows/claude.yml`](../../../.github/workflows/claude.yml) wraps this
action and [`pr-apply`](../pr-apply/) in the two jobs `--apply` needs, with the
author check and the App token. osdlc/osdlc runs it on its own triggers.
Another repository calls it from a short workflow of its own:

```yaml
name: claude
on:
  issue_comment: { types: [created] }
  pull_request_review_comment: { types: [created] }
  pull_request_review: { types: [submitted] }
permissions: {}
jobs:
  claude:
    permissions: { contents: read, pull-requests: write, issues: write }
    uses: osdlc/osdlc/.github/workflows/claude.yml@main
    secrets: inherit
```

A called workflow sees the calling repository's event, variables and secrets,
so the settings live there, as repository or organization variables. An input
of the same meaning under `with:` overrides a variable.

| Variable                 | Input           | Default | Meaning                                                                    |
| ------------------------ | --------------- | ------- | -------------------------------------------------------------------------- |
| `PR_AGENT_TRIGGER_USERS` | `trigger-users` | empty   | Logins that may call the agent, comma separated, no spaces. Empty: nobody. |
| `PR_AGENT_APP_CLIENT_ID` | `app-client-id` | none    | Client ID of the GitHub App that pushes `--apply` commits. Not a secret.   |
| `PR_AGENT_ENVIRONMENT`   | `environment`   | none    | Environment for the push job, for example one that holds the App key.      |

Secrets: `ANTHROPIC_API_KEY` for the agent, and `PR_AGENT_APP_PRIVATE_KEY`, the App's
private key, for `--apply`. `secrets: inherit` passes them inside one
organization or enterprise; a repository elsewhere names them under `secrets:`.
Without the App settings, read-only modes work and `--apply` posts the agent's
output with "no push token".

The author check is in the workflow's job `if`: another person's comment stops
before a runner starts or a key is in reach. The workflow fetches this action
and `pr-apply` from its own commit of osdlc/osdlc, next to the repository
checkout, so the ref after `@` pins both, and the agent's tree and patch never
contain them. `@main` takes every change as soon as it merges; outside osdlc,
pin a commit SHA, since the workflow sees your keys.

## Use the action

For a job of your own, instead of the workflow:

```yaml
jobs:
  claude:
    if: >-
      (github.event.comment.user.login || github.event.review.user.login) == '<login>'
      && contains(github.event.comment.body || github.event.review.body, '@claude')
      && (github.event_name != 'issue_comment' || github.event.issue.pull_request)
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions: { contents: read, pull-requests: write, issues: write }
    steps:
      - uses: osdlc/osdlc/packages/gh-actions/claude-pr@<commit-sha> # gh-actions/v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Keep the author check in the job's `if`: it stops other people's comments
before a runner starts or the key is in reach. `--apply` needs a second job
that runs [`pr-apply`](../pr-apply/) when this action's `apply-patch` output is
`true`; copy it from the workflow. Without it `--apply` runs the agent but
nothing is pushed.

## Inputs

| Input                 | Default               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic-api-key`   | required              | One key, or several separated by spaces, commas or newlines. Tried in order, so the list order is the priority (`work-key,personal-key` uses the work key until it is out of credit). A key is passed over, with a warning naming its position, only when it fails authentication or its account is out of credit or quota (HTTP 402, `billing_error`, "credit balance is too low", or a 429 that names a usage, spend or monthly limit); a plain per-minute rate limit or any other error stops the run. To rotate, set the secret to `new old`, later `new`. |
| `github-token`        | `github.token`        | Reads the pull request and posts the comment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `claude-code-version` | `2.1.319`             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `marketplace-url`     | the osdlc marketplace | The one marketplace `plugins` come from. Ignored when `marketplaces` is set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `marketplaces`        | empty                 | Several marketplaces, one per line, as `name=https-git-url` with an optional ` ref`, in agent-setup's format. When set it **wins** over `marketplace-url`: agent-setup installs Claude Code and the plugins from them (claude cannot pin a ref), and every entry in `plugins` must name one of them.                                                                                                                                                                                                                                                           |
| `plugins`             | `craft@osdlc`         | `plugin@marketplace`, separated by spaces or newlines. Review mode needs craft.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `max-turns`           | `60`                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Shared scripts

The mention filter, the key loop, the prompt, the comment and the markers live
in [`../pr-common`](../pr-common/), shared with
[`codex-pr`](../codex-pr/) and [`cursor-pr`](../cursor-pr/). This folder keeps
`install.sh` and `harness.sh`, which runs `claude -p` once with one key and
says whether the failure was an authentication failure.

## Pinning

`@main` takes every fix as soon as it merges in osdlc/osdlc. For a fixed
version, pin a commit SHA instead.

This is a stopgap. The planned `agent-pr-answer` action (see
`docs/planning/agent-ci.md`) runs the same job through `@osdlc/agent-call` on
any harness and will replace it.

### Free-form instruction

`@claude <free text> --apply` is an instruction when the first line after the
mention is not a `/skill` and has a standalone `--apply` word. `--apply` is
removed; the rest of the comment, following lines included, is the instruction.
It uses the skill path with edits allowed: the same "How you were called" block
(the instruction fenced as data, edits allowed), patch artifact, push job,
refusals and one comment. There is no skill to find.
Free text without `--apply` is still an answer, always read-only.

```
@claude rename the helper foo to bar --apply
@claude --apply
fix the typos in docs/ and keep the wording otherwise
```

- **Commit:** `claude: instruction from #<pr> comment`.
- **Comment:** **Claude applied the instruction** for `<sha7>` and pushed `<sha7>`;
  marker `<!-- claude-run: done|failed head=<sha> -->` (skill runs use the same marker).
