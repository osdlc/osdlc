# codex-pr

Answers `@codex` on a pull request with the Codex CLI, or reviews the pull
request when the comment starts with `@codex review`. It works like
[`claude-pr`](../claude-pr/) and shares its scripts ([`pr-common`](../pr-common/)).

- **Answer:** any comment, inline review comment or review that mentions
  `@codex` gets Codex's answer as a pull request comment.
- **Review:** `@codex review [focus]` at the start of a comment reviews the pull
  request against its base branch. Text after `review` (more lines too) is the
  focus. The comment opens with **Codex review done** and the commit it covered.
- **Skill:** `@codex /<plugin>:<skill> [args]` runs any installed skill, read-only, or
  with `--apply` commits and pushes its edits; see [Skill mode](#skill-mode).
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

## Skill mode

`@codex /<plugin>:<skill> [args...]` as the first line runs any installed skill
(no allowlist; a bare `/<skill>` works too) and posts its output as a comment.
The other lines of the comment are extra instructions. The skill name must match
`^/?[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?$`, else the run is refused. Comment text
reaches the scripts only through environment variables and is passed to the
agent as text, never evaluated.

```
@codex /craft:simplify
@codex /craft:simplify src/ --apply
@codex /craft:simplify focus on the tests
please keep behaviour identical
```

- **Read-only by default.** The skill runs, and its findings or proposed diff
  come back as a comment. The agent cannot edit, commit, push or comment.
- **`--apply`** (a word in the first line's args; it is removed before the args
  reach the skill) lets the agent edit files: `--sandbox workspace-write`: the checkout is writable, the network stays off (no `--apply` run can call out; a skill that needs the network will say so). Afterwards the
  **action**, not the agent, commits what changed and pushes it to the pull
  request's branch (see the safety rules below). The comment says what changed
  (diffstat and commit sha) or that nothing did.
- **Invocation.** The prompt is `$craft:simplify <args>` (codex's plugin-skill syntax, as review mode's `$craft:code-review`). The "How you were called" block goes in codex's `developer_instructions` config key (`-c developer_instructions=...`).
- **How you were called.** One block, the same words for every harness: the
  harness, repo, PR number and title, base and head sha, headless (no human to
  ask), the exact skill and args, the rest of the comment as fenced data, read-only or
  apply, where the diff is, the limits and how the final message is used.
- **Markers.** `<!-- codex-skill: done|failed head=<sha> -->`; the first line is
  **Codex ran /<skill>** for `<sha7>` (and ` and pushed <sha7>` after `--apply`
  pushed). A skill the CLI does not know (Codex's "unknown skill" reply) posts a failed marker with the reason.

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
5. The commit is `codex: /<skill> <args> (requested in #<pr> comment)`, authored
   by `git-user-name` / `git-user-email` (default `github-actions[bot]`), with no
   trailers. Nothing changed means no commit and no push.
6. The App's permissions bound what an applied change can touch (without
   `workflows`, GitHub rejects a push that edits `.github/workflows`).

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

To allow `--apply`, give the job a GitHub App token as `push-token` (see this
repository's `.github/workflows/codex.yml`: the `codex-comment` job mints the
osdlc-release token in the `release-plz` environment, which deploys from `main`
only, so it covers `issue_comment` events; inline review comments and reviews
run read-only).

Keep the author check in the job's `if`: it stops other people's comments
before a runner starts or the key is in reach.

## Inputs

| Input            | Default                                                 |                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai-api-key` | required                                                | One key, or several separated by spaces, commas or newlines. Tried in order; only an authentication failure moves on, with a warning naming the dead key's position. |
| `github-token`   | `github.token`                                          | Reads the pull request and posts the comment.                                                                                                                        |
| `push-token`     | empty                                                   | Pushes the `--apply` commit (a GitHub App token, so CI runs). Never given to the agent. Empty: `--apply` is refused.                                                 |
| `git-user-name`  | `github-actions[bot]`                                   | Author name of the `--apply` commit.                                                                                                                                 |
| `git-user-email` | `41898282+github-actions[bot]@users.noreply.github.com` | Author email of the `--apply` commit.                                                                                                                                |
| `codex-version`  | `0.162.0`                                               |                                                                                                                                                                      |
| `model`          | empty                                                   | Passed as `-m`. Empty is codex's default model.                                                                                                                      |
| `marketplaces`   | the osdlc marketplace                                   | One per line, `name=https-git-url` with an optional ` ref` (agent-setup's format).                                                                                   |
| `plugins`        | `craft@osdlc`                                           | `plugin@marketplace`, separated by spaces or newlines; each must name a listed marketplace. Review mode needs craft.                                                 |

## Pinning

`@main` takes every fix as soon as it merges in osdlc/osdlc. For a fixed
version, pin a commit SHA instead.
