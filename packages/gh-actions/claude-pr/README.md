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
  reach the skill) lets the agent edit files: `--allowedTools` gains `Edit,Write,MultiEdit`; `--disallowedTools` keeps `NotebookEdit`, `Bash(git commit:*)`, `Bash(git push:*)` and `Bash(gh pr comment:*)`. Afterwards the
  **action**, not the agent, commits what changed and pushes it to the pull
  request's branch (see the safety rules below). The comment says what changed
  (diffstat and commit sha) or that nothing did.
- **Invocation.** The comment's first line becomes the prompt, `/craft:simplify <args>`, which `claude -p` runs as a slash command. The "How you were called" block (below) goes in `--append-system-prompt`, because claude would pass every later prompt line to the skill as its arguments.
- **How you were called.** One block, the same words for every harness: the
  harness, repo, PR number and title, base and head sha, headless (no human to
  ask), the exact skill and args, the rest of the comment as fenced data, read-only or
  apply, where the diff is, the limits and how the final message is used.
- **Markers.** `<!-- claude-skill: done|failed head=<sha> -->`; the first line is
  **Claude ran /<skill>** for `<sha7>` (and ` and pushed <sha7>` after `--apply`
  pushed). A skill the CLI does not know (Claude's "unknown command" reply) posts a failed marker with the reason.

### `--apply` safety rules

1. The pull request's head must be in the same repository (a fork is refused
   before the agent runs).
2. `push-token` must be set (a GitHub App token, so CI runs on the push); the
   action never falls back to `GITHUB_TOKEN`, and refuses with a comment instead.
3. Before pushing, `git rev-parse HEAD` must equal the pull request's current
   `headRefOid`. A moved head, or a commit the agent made itself, is refused and
   nothing is pushed. The push is a plain `git push origin HEAD:refs/heads/<head>`:
   never forced, hooks off.
4. The push token is only in the commit-and-push step's environment, never the
   agent's. The agent's own `git config` is compared before pushing.
5. The commit is `claude: /<skill> <args> (requested in #<pr> comment)`, authored
   by `git-user-name` / `git-user-email` (default `github-actions[bot]`), with no
   trailers. Nothing changed means no commit and no push.
6. The App's permissions bound what an applied change can touch (without
   `workflows`, GitHub rejects a push that edits `.github/workflows`).

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

To allow `--apply`, give the job a GitHub App token as `push-token` (see this
repository's `.github/workflows/claude.yml`: the `claude-comment` job mints the
osdlc-release token in the `release-plz` environment, which deploys from `main`
only, so it covers `issue_comment` events; inline review comments and reviews
run read-only).

Keep the author check in the job's `if`: it stops other people's comments
before a runner starts or the key is in reach.

## Inputs

| Input                 | Default                                                 |                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic-api-key`   | required                                                | One key, or several separated by spaces, commas or newlines. Tried in order; only an authentication failure moves on, with a warning naming the dead key's position. To rotate, set the secret to `new old`, later `new`.                                                                            |
| `github-token`        | `github.token`                                          | Reads the pull request and posts the comment.                                                                                                                                                                                                                                                        |
| `push-token`          | empty                                                   | Pushes the `--apply` commit (a GitHub App token, so CI runs). Never given to the agent. Empty: `--apply` is refused.                                                                                                                                                                                 |
| `git-user-name`       | `github-actions[bot]`                                   | Author name of the `--apply` commit.                                                                                                                                                                                                                                                                 |
| `git-user-email`      | `41898282+github-actions[bot]@users.noreply.github.com` | Author email of the `--apply` commit.                                                                                                                                                                                                                                                                |
| `claude-code-version` | `2.1.319`                                               |                                                                                                                                                                                                                                                                                                      |
| `marketplace-url`     | the osdlc marketplace                                   | The one marketplace `plugins` come from. Ignored when `marketplaces` is set.                                                                                                                                                                                                                         |
| `marketplaces`        | empty                                                   | Several marketplaces, one per line, as `name=https-git-url` with an optional ` ref`, in agent-setup's format. When set it **wins** over `marketplace-url`: agent-setup installs Claude Code and the plugins from them (claude cannot pin a ref), and every entry in `plugins` must name one of them. |
| `plugins`             | `craft@osdlc`                                           | `plugin@marketplace`, separated by spaces or newlines. Review mode needs craft.                                                                                                                                                                                                                      |
| `max-turns`           | `60`                                                    |                                                                                                                                                                                                                                                                                                      |

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
