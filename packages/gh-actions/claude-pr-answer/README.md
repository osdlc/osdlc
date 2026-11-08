# claude-pr-answer

Asks Claude Code a question about a pull request and posts its answer as a
pull request comment. Claude gets read-only tools: it reads the checkout,
runs `gh pr view` and `gh pr diff`, read-only git commands and `node`, and
uses skills. It cannot edit, commit, push or comment; the action posts the
answer itself, or the error with a link to the run when there is none.

Run [`claude-setup`](../claude-setup/) first.

```yaml
on:
  issue_comment:
    types: [created]

jobs:
  answer:
    # Who may trigger it, and on what, is the caller's policy.
    if: >-
      github.event.issue.pull_request
      && github.event.comment.user.login == 'your-login'
      && contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@<sha>
        with:
          ref: refs/pull/${{ github.event.issue.number }}/head
          fetch-depth: 0
      - uses: osdlc/osdlc/packages/gh-actions/claude-setup@<commit-sha>
      - uses: osdlc/osdlc/packages/gh-actions/claude-pr-answer@<commit-sha>
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          pr: ${{ github.event.issue.number }}
          request: ${{ github.event.comment.body }}
          source-url: ${{ github.event.comment.html_url }}
```

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `anthropic-api-key` | required | Claude Console API key. |
| `pr` | required | Pull request number. |
| `request` | required | The question, usually the comment body. |
| `source-url` | none | Link to the triggering comment, quoted to Claude. |
| `working-directory` | `.` | Checkout of the pull request. |
| `github-token` | `github.token` | Token for `gh`: pull-requests read, and write to post. |
| `model` | Claude Code default | Model to use. |
| `max-turns` | `30` | Cap on agent turns. |
| `allowed-tools` | read-only set | Tools Claude may use. |
| `disallowed-tools` | edits, commits, pushes, `gh pr comment` | Tools Claude may never use. |
| `post` | `true` | Post the answer or error as a comment. |

## Outputs

| Output | Meaning |
| --- | --- |
| `is-error` | `true` when Claude's run ended in an error. |
| `result-file` | Path to the CLI's JSON result. |
| `cost-usd` | Reported cost of the run in USD. |

## Running it locally

`answer.sh` reads its inputs from the environment, so it runs outside Actions:

```sh
cd <checkout of the pull request>
PR=704 REQUEST="What does this change?" ../packages/gh-actions/claude-pr-answer/answer.sh
```

## Licence

`MIT OR Apache-2.0`.
