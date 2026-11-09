# codex-pr

Answers `@codex` on a pull request with the Codex CLI, or reviews the pull
request when the comment starts with `@codex review`. It works like
[`claude-pr`](../claude-pr/) and shares its scripts ([`pr-common`](../pr-common/)).

- **Answer:** any comment, inline review comment or review that mentions
  `@codex` gets Codex's answer as a pull request comment.
- **Review:** `@codex review [focus]` at the start of a comment reviews the pull
  request against its base branch. Text after `review` (more lines too) is the
  focus. The comment opens with **Codex review done** and the commit it covered.
- **Marker:** every comment ends with `<!-- codex-review: done head=<sha> -->`
  (or `failed`; answers use `codex-answer`).
- **Only real mentions:** `@codex` inside code blocks, inline code or quoted
  lines is ignored, and the job stops before installing anything.
- **Errors are posted:** if checkout, install or Codex fails, the comment says
  so and links the run log. A key that the API echoes back is replaced by `***`.
- **Key:** the secret is `OPENAI_API_KEY`. `codex exec` reads `CODEX_API_KEY`
  (it ignores `OPENAI_API_KEY`, checked on 0.162.0), so the action passes the
  key under that name. An authentication failure is a failed turn whose message
  says `401 Unauthorized`, `invalid_api_key`, `Incorrect API key` or `Missing
bearer`; nothing else rotates to the next key.
- **Read-only:** `codex exec --sandbox read-only`: no writes and no network. So
  the action writes the pull request text and diff to files in `$RUNNER_TEMP` and
  tells codex to read them. `GH_TOKEN` is kept out of codex's environment.
- **Review skill:** installed by agent-setup (`craft@osdlc`) and called as
  `$craft:code-review`, codex's spelling of a plugin skill.
- **No turn limit:** codex has no max-turns flag; `timeout-minutes` on the job
  bounds a run.

## Use

```yaml
name: codex
on:
  issue_comment: { types: [created] }
  pull_request_review_comment: { types: [created] }
  pull_request_review: { types: [submitted] }
permissions: {}
jobs:
  codex:
    if: >-
      (github.event.comment.user.login || github.event.review.user.login) == 'sksizer'
      && contains(github.event.comment.body || github.event.review.body, '@codex')
      && (github.event_name != 'issue_comment' || github.event.issue.pull_request)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions: { contents: read, pull-requests: write, issues: write }
    steps:
      - uses: osdlc/osdlc/packages/gh-actions/codex-pr@main
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

Keep the author check in the job's `if`: it stops other people's comments
before a runner starts or the key is in reach.

## Inputs

| Input            | Default               |                                                                                                                                                                      |
| ---------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai-api-key` | required              | One key, or several separated by spaces, commas or newlines. Tried in order; only an authentication failure moves on, with a warning naming the dead key's position. |
| `github-token`   | `github.token`        | Reads the pull request and posts the comment.                                                                                                                        |
| `codex-version`  | `0.162.0`             |                                                                                                                                                                      |
| `model`          | empty                 | Passed as `-m`. Empty is codex's default model.                                                                                                                      |
| `marketplaces`   | the osdlc marketplace | One per line, `name=https-git-url` with an optional ` ref` (agent-setup's format).                                                                                   |
| `plugins`        | `craft@osdlc`         | `plugin@marketplace`, separated by spaces or newlines; each must name a listed marketplace. Review mode needs craft.                                                 |

## Pinning

`@main` takes every fix as soon as it merges in osdlc/osdlc. For a fixed
version, pin a commit SHA instead.
