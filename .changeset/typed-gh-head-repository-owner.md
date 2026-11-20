---
'@osdlc/typed-gh': minor
---

`PullRequest.headRepositoryOwner`: the login of the head repository's owner when the listing asks for `headRepositoryOwner`, so a parent's listing can pick out the pull requests opened from one fork. Null when not asked for. The field is required on the type, so code that builds a `PullRequest` by hand (a test fixture, say) sets it, usually to `null`.
