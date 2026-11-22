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
- **Instruction:** `@codex <free text> --apply` (not a `/skill`) carries out the text as a
  free-form instruction, with edits allowed; see [Free-form instruction](#free-form-instruction).
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
bearer`. A failed turn that says `insufficient_quota`, `exceeded your current quota`, `billing_hard_limit` or `402 Payment Required` means the key is out of quota. Those two reasons, and nothing else, move on to the next key; the failure comment says which applied.
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
@codex /craft:comment-review
@codex /craft:comment-review src/ --apply
@codex /craft:comment-review focus on the tests
please keep behaviour identical
```

- **Read-only by default.** The skill runs, and its findings or proposed diff
  come back as a comment. The agent cannot edit, commit, push or comment.
- **`--apply`** (a word in the first line's args; it is removed before the args
  reach the skill) lets the agent edit files: `--sandbox workspace-write`: the checkout is writable, the network stays off (no `--apply` run can call out; a skill that needs the network will say so). Afterwards the agent job makes a patch
  (`git diff --binary`) of the working tree and uploads it as the
  `codex-pr-apply` artifact. A **second job**, which
  never runs the agent, checks the patch and pushes it with a GitHub App token
  (see [`pr-apply`](../pr-apply/)). That job posts the one comment: the agent's
  output, the diffstat and commit sha, or why nothing was pushed. If the agent
  changed nothing, the agent job posts its output and says so. On a failed agent
  run the agent job posts the failure.
- **Invocation.** The prompt is `$craft:comment-review <args>` (codex's plugin-skill syntax, as review mode's `$craft:code-review`). The "How you were called" block goes in codex's `developer_instructions` config key (`-c developer_instructions=...`).
- **How you were called.** One block, the same words for every harness: the
  harness, repo, PR number and title, base and head sha, headless (no human to
  ask), the exact skill and args, the rest of the comment as fenced data, read-only or
  apply, where the diff is, the limits and how the final message is used.
- **Markers.** `<!-- codex-run: done|failed head=<sha> -->`; the first line is
  **Codex ran /<skill>** for `<sha7>` (and ` and pushed <sha7>` after `--apply`
  pushed). A skill the CLI does not know (Codex's "unknown skill" reply) posts a failed marker with the reason; only a short reply that opens with that message and names the skill counts. A first word that is not a valid skill name (such as `/etc/hosts`) is free text: an answer, or an instruction with `--apply`.

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

[`.github/workflows/codex.yml`](../../../.github/workflows/codex.yml) wraps this
action and [`pr-apply`](../pr-apply/) in the two jobs `--apply` needs, with the
author check and the App token. osdlc/osdlc runs it on its own triggers.
Another repository calls it from a short workflow of its own:

```yaml
name: codex
on:
  issue_comment: { types: [created] }
  pull_request_review_comment: { types: [created] }
  pull_request_review: { types: [submitted] }
permissions: {}
jobs:
  codex:
    permissions: { contents: read, pull-requests: write, issues: write }
    uses: osdlc/osdlc/.github/workflows/codex.yml@main
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

Secrets: `OPENAI_API_KEY` for the agent, and `PR_AGENT_APP_PRIVATE_KEY`, the App's
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
  codex:
    if: >-
      (github.event.comment.user.login || github.event.review.user.login) == '<login>'
      && contains(github.event.comment.body || github.event.review.body, '@codex')
      && (github.event_name != 'issue_comment' || github.event.issue.pull_request)
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions: { contents: read, pull-requests: write, issues: write }
    steps:
      - uses: osdlc/osdlc/packages/gh-actions/codex-pr@<commit-sha> # gh-actions/v1
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

Keep the author check in the job's `if`: it stops other people's comments
before a runner starts or the key is in reach. `--apply` needs a second job
that runs [`pr-apply`](../pr-apply/) when this action's `apply-patch` output is
`true`; copy it from the workflow, and set the input `push-job: "true"`.
Without that job (`push-job` left `false`), `--apply` runs the agent, uploads
the patch artifact, pushes nothing and posts the agent's output with a note
that nothing was pushed.

## Inputs

| Input            | Default               |                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai-api-key` | required              | One key, or several separated by spaces, commas or newlines. Tried in order, so the list order is the priority. A key is passed over, with a warning naming its position, when it fails authentication or its account is out of quota (`insufficient_quota`, "exceeded your current quota", a billing hard limit, `402 Payment Required`); any other error stops the run. |
| `github-token`   | `github.token`        | Reads the pull request and posts the comment.                                                                                                                                                                                                                                                                                                                             |
| `codex-version`  | `0.162.0`             |                                                                                                                                                                                                                                                                                                                                                                           |
| `model`          | empty                 | Passed as `-m`. Empty is codex's default model.                                                                                                                                                                                                                                                                                                                           |
| `marketplaces`   | the osdlc marketplace | One per line, `name=https-git-url` with an optional ` ref` (agent-setup's format).                                                                                                                                                                                                                                                                                        |
| `plugins`        | `craft@osdlc`         | `plugin@marketplace`, separated by spaces or newlines; each must name a listed marketplace. Review mode needs craft.                                                                                                                                                                                                                                                      |
| `push-job`       | `false`               | `"true"` when a later job runs `pr-apply`; that job then posts the result of a patched `--apply` run. Left `false`, this action posts it and says nothing was pushed.                                                                                                                                                                                                     |

## Pinning

`@main` takes every fix as soon as it merges in osdlc/osdlc. For a fixed
version, pin a commit SHA instead.

### Free-form instruction

`@codex <free text> --apply` is an instruction when the first line after the
mention is not a `/skill` and has a standalone `--apply` word. `--apply` is
removed; the rest of the comment, following lines included, is the instruction.
It uses the skill path with edits allowed: the same "How you were called" block
(the instruction fenced as data, edits allowed), patch artifact, push job,
refusals and one comment. There is no skill to find.
Free text without `--apply` is still an answer, always read-only.

```
@codex rename the helper foo to bar --apply
@codex --apply
fix the typos in docs/ and keep the wording otherwise
```

- **Commit:** `codex: instruction from #<pr> comment`.
- **Comment:** **Codex applied the instruction** for `<sha7>` and pushed `<sha7>`;
  marker `<!-- codex-run: done|failed head=<sha> -->` (skill runs use the same marker).
