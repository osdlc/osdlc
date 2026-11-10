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
  `claude-pr-apply` artifact. A **second job** in the `pr-agent` environment, which
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
- **Markers.** `<!-- claude-skill: done|failed head=<sha> -->`; the first line is
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
force-push). If the `pr-agent` environment or its secrets are missing, the push
job posts the agent's output and says nothing was pushed.

## Use

```yaml
name: claude
on:
  issue_comment: { types: [created] }
  pull_request_review_comment: { types: [created] }
  pull_request_review: { types: [submitted] }
permissions: {}
jobs:
  claude:
    if: >-
      (github.event.comment.user.login || github.event.review.user.login) == 'sksizer'
      && contains(github.event.comment.body || github.event.review.body, '@claude')
      && (github.event_name != 'issue_comment' || github.event.issue.pull_request)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions: { contents: read, pull-requests: write, issues: write }
    steps:
      - uses: osdlc/osdlc/packages/gh-actions/claude-pr@main
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

`--apply` needs the second job, as in this repository's
`.github/workflows/claude.yml`: `claude-push` runs `needs: claude` when the action's
`apply-patch` output is `true`, with `environment: pr-agent`, mints the App
token and calls `osdlc/osdlc/packages/gh-actions/pr-apply`. One setup for
all three events. Without that job `--apply` still runs the agent but nothing is pushed.

Keep the author check in the job's `if`: it stops other people's comments
before a runner starts or the key is in reach.

## Inputs

| Input                 | Default               |                                                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic-api-key`   | required              | One key, or several separated by spaces, commas or newlines. Tried in order; only an authentication failure moves on, with a warning naming the dead key's position. To rotate, set the secret to `new old`, later `new`.                                                                            |
| `github-token`        | `github.token`        | Reads the pull request and posts the comment.                                                                                                                                                                                                                                                        |
| `claude-code-version` | `2.1.319`             |                                                                                                                                                                                                                                                                                                      |
| `marketplace-url`     | the osdlc marketplace | The one marketplace `plugins` come from. Ignored when `marketplaces` is set.                                                                                                                                                                                                                         |
| `marketplaces`        | empty                 | Several marketplaces, one per line, as `name=https-git-url` with an optional ` ref`, in agent-setup's format. When set it **wins** over `marketplace-url`: agent-setup installs Claude Code and the plugins from them (claude cannot pin a ref), and every entry in `plugins` must name one of them. |
| `plugins`             | `craft@osdlc`         | `plugin@marketplace`, separated by spaces or newlines. Review mode needs craft.                                                                                                                                                                                                                      |
| `max-turns`           | `60`                  |                                                                                                                                                                                                                                                                                                      |

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
