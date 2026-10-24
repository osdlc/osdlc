---
"@osdlc/typed-git": minor
---

When a git call fails and throws a `FailureError`, the error's `message` now starts with the git command, for example `git push: The remote 'origin' does not exist or is not a git repository.`, followed by the hint. Before, the message had no command, so code that ran several git calls in one `try` could not tell which one failed. `failure.message` is unchanged.

The new `describeGitFailure(failure)` builds the same `git <verb>: <message> <hint>` line for a failure returned by `git.try.*`.

If your code matches on the text of a thrown git error's `message`, it will now see the `git <verb>: ` prefix. Match on `error.failure.kind` instead.
