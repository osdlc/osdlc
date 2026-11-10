# cursor-pr

Answers `@cursor` on a pull request with the Cursor CLI, or reviews the pull
request when the comment starts with `@cursor review`. It works like
[`claude-pr`](../claude-pr/) and shares its scripts ([`pr-common`](../pr-common/)).

- **Answer:** any comment, inline review comment or review that mentions
  `@cursor` gets Cursor's answer as a pull request comment.
- **Review:** `@cursor review [focus]` at the start of a comment reviews the pull
  request against its base branch. Text after `review` (more lines too) is the
  focus. The comment opens with **Cursor review done** and the commit it covered.
- **Skill:** `@cursor /<plugin>:<skill> [args]` runs any installed skill, read-only, or
  with `--apply` commits and pushes its edits; see [Skill mode](#skill-mode).
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

## Skill mode

`@cursor /<plugin>:<skill> [args...]` as the first line runs any installed skill
(no allowlist; a bare `/<skill>` works too) and posts its output as a comment.
The other lines of the comment are extra instructions. The skill name must match
`^/?[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?$`, else the run is refused. Comment text
reaches the scripts only through environment variables and is passed to the
agent as text, never evaluated.

```
@cursor /craft:comment-review
@cursor /craft:comment-review src/ --apply
@cursor /craft:comment-review focus on the tests
please keep behaviour identical
```

- **Read-only by default.** The skill runs, and its findings or proposed diff
  come back as a comment. The agent cannot edit, commit, push or comment.
- **`--apply`** (a word in the first line's args; it is removed before the args
  reach the skill) lets the agent edit files: the temporary `.cursor/cli.json` allows `Write(**)` (still denying `Shell(gh)`, `Shell(curl)`, `Shell(wget)`), `--mode ask` is dropped and `--force` is passed so the allowed tools run without a prompt nobody could answer. Afterwards the agent job makes a patch
  (`git diff --binary`) of the working tree and uploads it as the
  `cursor-pr-apply` artifact. A **second job** in the `pr-agent` environment, which
  never runs the agent, checks the patch and pushes it with a GitHub App token
  (see [`pr-apply`](../pr-apply/)). That job posts the one comment: the agent's
  output, the diffstat and commit sha, or why nothing was pushed. If the agent
  changed nothing, the agent job posts its output and says so. On a failed agent
  run the agent job posts the failure.
- **Invocation.** Cursor has no plugin install, so the skill's `SKILL.md` is found on disk and inlined: `./.cursor/skills`, `~/.cursor/skills`, then this repository's `.cursor-plugin/packs/<plugin>/skills` (every pack for a bare `/skill`). The prompt is the "How you were called" block, then the skill text, then "Run the ... skill ... with the arguments: ...". If the skill is not found the comment lists every path tried and the agent is not run.
- **How you were called.** One block, the same words for every harness: the
  harness, repo, PR number and title, base and head sha, headless (no human to
  ask), the exact skill and args, the rest of the comment as fenced data, read-only or
  apply, where the diff is, the limits and how the final message is used.
- **Markers.** `<!-- cursor-skill: done|failed head=<sha> -->`; the first line is
  **Cursor ran /<skill>** for `<sha7>` (and ` and pushed <sha7>` after `--apply`
  pushed). A skill the CLI does not know (a missing `SKILL.md`) posts a failed marker with the reason.

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

`--apply` needs the second job, as in this repository's
`.github/workflows/cursor.yml`: `cursor-push` runs `needs: cursor` when the action's
`apply-patch` output is `true`, with `environment: pr-agent`, mints the App
token and calls `osdlc/osdlc/packages/gh-actions/pr-apply`. One setup for
all three events. Without that job `--apply` still runs the agent but nothing is pushed.

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
