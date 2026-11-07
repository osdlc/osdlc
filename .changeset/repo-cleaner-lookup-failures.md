---
'@osdlc/repo-cleaner': minor
---

A lookup that fails costs its evidence, not the repository. A pull request listing the provider cannot make, such as `gh pr list` for a repository the signed-in account cannot see or that no longer exists, used to turn the whole repository into an error row with no rows. Its worktrees and branches are now judged on git evidence, the provider status carries `listError`, and the repository carries a note. A branch with no PR says the lookup failed, or that the CLI is missing or signed out, instead of that none was found. While the listing has failed, deleting a remote branch with no known PR needs `confirm-open-pr`, since deleting an open PR's head branch closes the PR. The GitLab provider now says why a listing failed (`glab`'s error, a page cut short or unreadable, or a remote URL with no project).

`--offline` now reads remote branches from the remote-tracking refs on disk, as documented, instead of calling `git ls-remote`, so git does not contact the remote. Pull requests are still looked up; `--provider none` is no network at all. After a fetch, a `git ls-remote` that fails falls back to the refs the fetch just wrote, with a note on the repository and on each remote row. A failed fetch still fails the repository.

`RepoSweep` has a new `notes` field: one sentence for each lookup the sweep judged without. The text and summary reports show them under the repository's header and the JSON carries them. `--format commands` and `plan` print them on stderr, and so does `clean`, with or without `--plan`, from the re-check (`Preview.notes`, also in `clean --format json`). `lookupPrs` replaces `fetchPrs` and returns the reason a listing failed with the pull requests. A `PrProvider` reports a failure by returning null or by throwing.
