# Changelog

## Unreleased

- The workflows that run it take the App from the variable `PR_AGENT_APP_CLIENT_ID` and the secret `PR_AGENT_APP_PRIVATE_KEY`, with an optional environment (`PR_AGENT_ENVIRONMENT`) in place of the required `pr-agent` one, and name the commit's author after the App.
- First version: the push half of `--apply` (a skill or a free-form instruction) for claude-pr, codex-pr and cursor-pr. Validates the patch artifact (same repository, not the default or base branch, head unmoved, no `.github/`, `.git*`, symlink, submodule or new executable changes), applies it to a fresh checkout, commits, pushes without force and posts the result comment.
