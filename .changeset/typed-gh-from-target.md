---
'@osdlc/typed-gh': minor
---

`graphql` (experimental): fill the target's owner or repo name with the new `fromTarget('owner')` / `fromTarget('repo')` markers. **Breaking for `graphql` callers:** a plain string variable is now always sent as written, so a real value of `{owner}` or `{repo}` (a branch name, say) is no longer replaced. Change `{ owner: '{owner}', name: '{repo}' }` to `{ owner: fromTarget('owner'), name: fromTarget('repo') }`. REST endpoints keep the `{owner}/{repo}` path template, which mirrors gh's own syntax.
