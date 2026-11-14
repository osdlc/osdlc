# pr-apply

The push half of `--apply` for [`claude-pr`](../claude-pr/),
[`codex-pr`](../codex-pr/) and [`cursor-pr`](../cursor-pr/). Not for direct use
outside a workflow that also runs one of them.

## Why two jobs

The agent runs arbitrary skill code, so the job it runs in has no environment,
no push token and no App key. When `--apply` is used and files changed, that job
uploads a `<agent>-pr-apply` artifact (`patch` from `git diff --binary`,
`meta.json` with the head sha it ran on and the changed paths, and `result.json`
with the agent's output) and sets the output `apply-patch` to `true`. This
action runs in a later job (`needs`) in the `pr-agent` environment, on a fresh
checkout: no agent, no node or pnpm, nothing from the pull request, only `git`
and `gh`. Because only this job's comment is posted for a patched run, the agent
job stays silent on success (on failure, or when nothing changed, it posts).

## What it checks, in order

1. A push token exists; else the comment says so (and to set up `pr-agent`) and
   keeps the agent's output.
2. The PR head is in this repository (no forks), is not the repository's default
   branch and is not the PR's base branch.
3. The PR's current head sha equals the sha the agent ran on (no moved head).
4. The patch applies (`git apply --index --binary`) to that head, then the staged
   change is refused if any path is under `.github/` or has a component starting
   with `.git`, is absolute or contains `..`, any side is a symlink (120000) or a
   submodule (160000), or a file gains the executable bit.
5. One commit, `<agent>: /<skill> <args> (requested in #<pr> comment)`, author
   `git-user-name` / `git-user-email` (the callers here use `osdlc-release[bot]`),
   no trailers. Pushed with `git push --no-verify origin HEAD:refs/heads/<PR head branch>`:
   never forced, only that ref. The token reaches git through a credential helper
   reading the environment, not argv or a file.

The comment ends with the usual marker, `<!-- <agent>-skill: done|failed head=<sha> -->`.
Main is also protected by the repository's rules (PRs required, no force-push).

## Owner setup

Create the environment once (Settings, Environments, New environment):

- Name: `pr-agent`.
- Deployment branches and tags: **All branches** (inline review comments and
  reviews run on `refs/pull/N/merge`, which a "main only" policy would block).
- No required reviewers (they would block every `--apply`), unless you want an approval click.
- Environment secrets `RELEASE_PLZ_APP_ID` and `RELEASE_PLZ_APP_PRIVATE_KEY`
  (the same names `pr-update.yml` uses; the osdlc-release App needs Contents:
  write; the mint step asks for `contents: write` only). Repository-level
  secrets of the same names also work.

Without the environment or secrets the push job posts the agent's output and
"no push token"; the artifact still holds the patch for 7 days.

## Inputs

| Input            | Default                                                 |                                                               |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `agent`          | required                                                | `claude`, `codex` or `cursor`.                                |
| `push-token`     | empty                                                   | App token that pushes (so CI runs). Empty: nothing is pushed. |
| `github-token`   | `github.token`                                          | Reads the PR, posts the comment.                              |
| `git-user-name`  | `github-actions[bot]`                                   | Commit author name.                                           |
| `git-user-email` | `41898282+github-actions[bot]@users.noreply.github.com` | Commit author email.                                          |
