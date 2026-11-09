# claude-pr

Answers `@claude` on a pull request with Claude Code, or reviews the pull
request when the comment starts with `@claude review`.

- **Answer:** any comment, inline review comment or review that mentions
  `@claude` gets Claude's answer as a pull request comment.
- **Review:** `@claude review [focus]` at the start of a comment runs the craft
  plugin's `/craft:code-review` against the pull request's base branch. Text
  after `review` (more lines too) is the focus. The comment opens with
  **Claude review done** and the commit it covered.
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
