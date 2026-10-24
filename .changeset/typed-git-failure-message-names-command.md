---
"@osdlc/typed-git": minor
---

The `FailureError` the plain door throws now names the git command in its `message`: `git push: The remote 'origin' does not exist or is not a git repository. List the remotes with `git remote -v`.` Before, the message was the bare classified sentence and a caller running several verbs in one `try` could not tell which one failed. `failure.message` is unchanged. The new `describeGitFailure(failure)` renders the same `git <verb>: <message> <hint>` line for a failure you hold from `git.try.*`.
