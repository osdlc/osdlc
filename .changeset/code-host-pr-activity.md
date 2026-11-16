---
'@osdlc/code-host': minor
---

`GithubCodeHost.getPr` reads a pull request's comments, reviews and inline review comments through `@osdlc/typed-gh`'s `prActivity`, in one GraphQL call, instead of `gh pr view`'s comments and reviews plus a REST call for the inline comments. Entry ids and thread ids are unchanged. Comments and reviews now carry `editedAt`, and activity is in timeline order. An activity read that fails, or cannot be read whole, now fails `getPr` instead of leaving the inline comments out.

Breaking: `codeHostPrFrom(pr, activity)` takes the rows of `prActivity` as its second argument, in place of the inline comments already mapped to `Activity`.
