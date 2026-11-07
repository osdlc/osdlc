---
"@osdlc/repo-cleaner": minor
---

A lookup that fails now costs its evidence, not the repository. See "When a lookup fails" in the README.

- A pull request listing that fails, such as `gh pr list` for a repository the account cannot see, no longer turns the repository into an error with no rows. Its rows are judged on git evidence, `RepoInfo.provider.listError` says why, and the repository carries a note.
- While open pull requests cannot be checked (the listing failed, or `gh`/`glab` is missing or signed out), deleting a remote branch with no known PR needs `confirm-open-pr`, since deleting an open PR's head branch closes it. `--provider none` asks nothing and gates nothing.
- `--offline` reads remote branches from the remote-tracking refs on disk, as documented, instead of calling `git ls-remote`. After a fetch, an `ls-remote` that fails falls back to those refs. A failed fetch still fails the repository.
- `clean` reports a remote branch the remote had already deleted as gone, instead of failing the run on the refused push, and counts it apart (`Step.gone`, `RunSummary.gone`).
- New in the library: `RepoSweep.notes`, `Preview.notes`, `RunOptions.onNotes` and the `RepoNote` type. A `PrProvider` reports a failure by returning null or by throwing.
