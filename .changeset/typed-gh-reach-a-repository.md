---
'@osdlc/typed-gh': minor
---

Reach a repository without a clone, find a pull request from what a person typed, read every page of a list, and list repositories and search pull requests. Some changes break callers of 0.5. They are marked `Breaking:`.

- `Gh` and `AsyncGh` take optional `repo` (`owner/name`) and `hostname` options, and `withRepo(repo)` returns the same client aimed at another repository. The target goes into each call's argv: `--repo host/owner/name` on `pr`, `issue` and `label` calls, `--hostname` and a filled `{owner}/{repo}` on `api` calls, and `--hostname` on `authStatus`. Every verb builder takes an optional `GhTarget` as its last argument. An invalid `repo` or `hostname` throws `RangeError`.
- `hostname` is any GitHub host: `github.com`, GitHub Enterprise Server, or a `<tenant>.ghe.com` host.
- Breaking: `parsePrUrl` accepts any GitHub host and returns `hostname` in its `PullRequestRef`. Before, it returned null for a host other than `github.com`.
- `prView` takes a number, a branch or a URL. A URL is passed without the client's target. A string that starts with `-` throws `RangeError`.
- `prFind(input)` returns the one PR that `input` names, and `parsePrRef(input)` reads it without running `gh`: `42`, `#42`, `owner/name#42`, a URL, or a branch name. Bare digits are a number first and then a branch. A branch gives its open PR, else its newest closed or merged one.
- Breaking: `prList({ head })` matches the head branch exactly, through `gh pr list --head`. Before, it passed `--search head:<branch>`, which matched by prefix.
- Breaking: `prList`, `issueList` and `labelList` return `{ rows, truncated } | null` instead of an array or null. Each asks `gh` for one row more than `limit`, and `truncated` is true when it came back. A `limit` that is not a positive integer throws `RangeError`. `openPrsForBranch` returns the same shape. The new `ListResult` type names it.
- `api` takes `paginate: true` to fetch every page; pages of arrays are joined into one `body`. With `etag` or `includeHeaders` it throws `RangeError`. An endpoint that starts with `-` throws `RangeError`.
- `graphql(query, variables, { paginate })` runs a GraphQL query and returns each page's `data`, or null when the call failed or any page has `errors` or no `data`. It refuses a mutation. `nodesAt(pages, path)` joins one connection's nodes across pages. Both are experimental, with `GraphqlOptions` and `GraphqlVariable`.
- Every `GhVerb` carries `readOnly`: true for every query and `prDiff`, false for every mutation. `GhVerb` also has an optional `env`.
- `repoList(owner)` and `repoView(repo?)` return the new `Repository` type. `searchPrs(query)` returns `PrSearchHit` rows, since `gh search prs` has its own field set. `REPO_FIELDS` and `SEARCH_PR_FIELDS` name their fields. `gh repo list` and `gh search` take no host flag, so the host reaches them as `GH_HOST`.
- New types: `GhTarget`, `GhOptions`, `AsyncGhOptions`, `ListResult`, `PrRef`, `Repository`, `RepositoryVisibility`, `PrSearchHit`, `RepoListOptions` and `SearchPrsOptions`.
