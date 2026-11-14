# Changelog

## Unreleased

- First version: the push half of `--apply` for claude-pr, codex-pr and cursor-pr. Validates the patch artifact (same repository, not the default or base branch, head unmoved, no `.github/`, `.git*`, symlink, submodule or new executable changes), applies it to a fresh checkout, commits, pushes without force and posts the result comment.
