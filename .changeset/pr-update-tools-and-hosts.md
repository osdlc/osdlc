---
'@osdlc/pr-update': minor
---

`pr-update` no longer reports a broken setup as "no open PRs". It checks before listing anything that `git` is on PATH, plus `gh` for a GitHub repository or `curl` for a Forgejo one, and stops with a message saying what to install (new exit code `22`). A PR listing the host refuses, such as `gh` not signed in or no network, is now an error naming the repository (exit `23`, and `{ "error": ... }` in a `--report` file), and a git remote that cannot be read says so (exit `24`). A self-hosted Forgejo remote is now recognised as a repository too.

The command-line tool now picks its code host from the `origin` remote (or `code_host.override`) instead of always using GitHub: a Forgejo remote works with `curl` and `FORGEJO_TOKEN`. Library callers that pass their own `codeHost` are unaffected, and the library default stays GitHub. New exports: `EXIT_MISSING_TOOL`, `EXIT_CODE_HOST`, `EXIT_NO_REMOTE`, `PrListError`, `CodeHostSetupError`, `selectedCodeHostFor`.
