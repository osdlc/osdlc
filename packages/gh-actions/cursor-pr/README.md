# cursor-pr

Answers `@cursor` on a pull request with the Cursor CLI, or reviews the pull
request when the comment starts with `@cursor review`. It works like
[`claude-pr`](../claude-pr/) and shares its scripts ([`pr-common`](../pr-common/)).

- **Answer:** any comment, inline review comment or review that mentions
  `@cursor` gets Cursor's answer as a pull request comment.
- **Review:** `@cursor review [focus]` at the start of a comment reviews the pull
  request against its base branch. Text after `review` (more lines too) is the
  focus. The comment opens with **Cursor review done** and the commit it covered.
- **Marker:** every comment ends with `<!-- cursor-review: done head=<sha> -->`
  (or `failed`; answers use `cursor-answer`).
- **Only real mentions:** `@cursor` inside code blocks, inline code or quoted
  lines is ignored, and the job stops before installing anything.
- **Errors are posted:** if checkout, install or Cursor fails, the comment says
  so and links the run log. A key that the API echoes back is replaced by `***`.
- **Key:** the secret is `CURSOR_API_KEY`. A bad key makes `agent` exit 1 with
  plain text ("The provided API key is invalid"), not JSON; that text, "not
  logged in" or "Authentication required" is an authentication failure and
  nothing else rotates to the next key.
- **Read-only, partly:** `agent -p --mode ask` (Cursor's Q&A mode) plus a
  temporary `.cursor/cli.json` that allows `Read(**)`, `Shell(git)` and
  `Shell(node)` and denies `Write(**)`, `Shell(gh)`, `Shell(curl)` and
  `Shell(wget)`. An existing `.cursor/cli.json` is put back afterwards.
  **Gap:** Cursor matches a shell rule on the command name only, so `git push`
  is not blocked by rule. With `contents: read` on the job the token cannot push.
  The sandbox is not enabled, and `GH_TOKEN` is kept out of the agent's environment.
  The pull request text and diff are written to files, since `gh` is denied.
- **Review skill:** Cursor has no plugin install, so the text of the craft
  `code-review` skill is copied from this repository's
  `.cursor-plugin/packs/craft/skills` (same ref as the action) onto the end of
  the review prompt, with the folder it can read the rubric and `diffkit.mjs` from.
- **`--trust`:** headless `agent` refuses an untrusted workspace, so the action
  passes `--trust`. Cursor's help says it needs an Enterprise plan with a
  service-account key; on other plans the run may fail with Cursor's own message.
- **No turn limit:** cursor has no max-turns flag; `timeout-minutes` bounds a run.

## Use

```yaml
name: cursor
on:
  issue_comment: { types: [created] }
  pull_request_review_comment: { types: [created] }
  pull_request_review: { types: [submitted] }
permissions: {}
jobs:
  cursor:
    if: >-
      (github.event.comment.user.login || github.event.review.user.login) == 'sksizer'
      && contains(github.event.comment.body || github.event.review.body, '@cursor')
      && (github.event_name != 'issue_comment' || github.event.issue.pull_request)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions: { contents: read, pull-requests: write, issues: write }
    steps:
      - uses: osdlc/osdlc/packages/gh-actions/cursor-pr@main
        with:
          cursor-api-key: ${{ secrets.CURSOR_API_KEY }}
```

Keep the author check in the job's `if`: it stops other people's comments
before a runner starts or the key is in reach.

## Inputs

| Input            | Default              |                                                                                                                                                                                          |
| ---------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor-api-key` | required             | One key, or several separated by spaces, commas or newlines. Tried in order; only an authentication failure moves on.                                                                    |
| `github-token`   | `github.token`       | Reads the pull request and posts the comment.                                                                                                                                            |
| `cursor-version` | `2026.11.05-86047df` | A full build id; agent-setup has its checksums built in.                                                                                                                                 |
| `model`          | empty                | Passed as `--model`. Empty is Cursor's default.                                                                                                                                          |
| `marketplaces`   | empty                | One per line, `name=https-git-url` (agent-setup's format). Cursor can register a marketplace, which may need `CURSOR_API_KEY` at install time; the action gives the install step no key. |
| `plugins`        | empty                | **Not supported on cursor**: agent-setup refuses a plugin there. Review mode inlines the craft code-review skill instead.                                                                |

## Pinning

`@main` takes every fix as soon as it merges in osdlc/osdlc. For a fixed
version, pin a commit SHA instead.
